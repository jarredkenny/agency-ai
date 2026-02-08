import * as fs from "fs";
import * as path from "path";
import { db } from "../db/client.js";

const HOME = process.env.HOME ?? "";
const ROLES_DIR = path.join(process.cwd(), "roles");

/**
 * Deterministic gateway port from agent name.
 * System agents each need a unique port; Docker always uses 18789 (isolated).
 */
export function gatewayPort(name: string, runtime: string): number {
  if (runtime !== "system") return 18789;
  let hash = 0;
  for (const c of name) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return 19000 + (Math.abs(hash) % 1000);
}

/**
 * Build the full openclaw.json config object from DB settings + agent-specific values.
 */
export async function buildOpenClawJson(
  agentName: string,
  role: string,
  runtime: string,
  workspace?: string,
  slackTokens?: { botToken?: string; appToken?: string },
): Promise<Record<string, unknown>> {
  const rows = await db
    .selectFrom("settings")
    .where("category", "=", "agent")
    .selectAll()
    .execute();

  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  // Use provided workspace or fall back to role directory
  const workspacePath = workspace ?? path.resolve(process.cwd(), `roles/${role}`);
  const port = gatewayPort(agentName, runtime);

  // Agent defaults
  const defaults: Record<string, unknown> = {
    workspace: workspacePath,
  };

  // Model
  const model: Record<string, unknown> = {
    primary: s["agent.model"] || "claude-sonnet-4-20250514",
  };
  if (s["agent.model_fallbacks"]) {
    model.fallbacks = s["agent.model_fallbacks"].split(",").map((m) => m.trim()).filter(Boolean);
  }
  defaults.model = model;

  defaults.thinkingDefault = s["agent.thinking"] || "low";
  defaults.timeoutSeconds = Number(s["agent.timeout_seconds"] || "600");
  defaults.maxConcurrent = Number(s["agent.max_concurrent"] || "1");
  defaults.compaction = { mode: s["agent.compaction"] || "default" };
  defaults.sandbox = {
    mode: s["agent.sandbox_mode"] || "non-main",
    scope: s["agent.sandbox_scope"] || "agent",
  };
  defaults.heartbeat = { every: s["agent.heartbeat_interval"] || "30m" };
  defaults.verboseDefault = "off";

  // Tools
  const tools: Record<string, unknown> = {
    profile: s["agent.tools_profile"] || "full",
    web: { search: { enabled: s["agent.web_search"] !== "false" } },
    exec: { timeoutSec: Number(s["agent.exec_timeout_sec"] || "1800") },
  };
  if (s["agent.tools_allow"]) {
    tools.allow = s["agent.tools_allow"].split(",").map((t) => t.trim()).filter(Boolean);
  }
  if (s["agent.tools_deny"]) {
    tools.deny = s["agent.tools_deny"].split(",").map((t) => t.trim()).filter(Boolean);
  }

  // Copy channels config from main openclaw profile (for Slack, etc.)
  const mainConfigPath = path.join(HOME, ".openclaw", "openclaw.json");
  let channels: Record<string, unknown> | undefined;
  if (fs.existsSync(mainConfigPath)) {
    try {
      const mainConfig = JSON.parse(fs.readFileSync(mainConfigPath, "utf-8"));
      if (mainConfig.channels) {
        channels = mainConfig.channels;
      }
    } catch {
      // ignore parse errors
    }
  }

  // Override Slack tokens with agent-specific ones if provided
  if (slackTokens?.botToken || slackTokens?.appToken) {
    if (!channels) channels = {};
    const slack = (channels.slack ?? {}) as Record<string, unknown>;
    if (slackTokens.botToken) slack.botToken = slackTokens.botToken;
    if (slackTokens.appToken) slack.appToken = slackTokens.appToken;
    if (!slack.mode) slack.mode = "socket";
    if (!slack.enabled) slack.enabled = true;
    if (slack.dm === undefined) slack.dm = { enabled: true, policy: "allowlist" };
    channels.slack = slack;
  }

  // Ensure agency CLI is in PATH for non-sandboxed agents
  const envPath = runtime === "docker"
    ? "/root/.bun/bin:/usr/local/bin:/usr/bin:/bin"
    : `${HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`;

  // Skills config - bundled skills always available, custom skills filtered via workspace
  const skillsConfig: Record<string, unknown> = {
    load: { watch: true },
  };

  const config: Record<string, unknown> = {
    agents: {
      defaults,
      list: [
        { id: "main" },
        { id: agentName, name: agentName, workspace: workspacePath },
      ],
    },
    tools,
    skills: skillsConfig,
    browser: { enabled: s["agent.browser_enabled"] !== "false" },
    logging: {
      level: s["agent.logging_level"] || "info",
      redactSensitive: s["agent.logging_redact"] || "tools",
    },
    gateway: {
      mode: "local",
      port,
      bind: "loopback",
      auth: {
        mode: "token",
        token: crypto.randomUUID(),
      },
    },
    commands: { native: "auto", restart: true },
    env: {
      PATH: envPath,
      AGENCY_AGENT_NAME: agentName,
      AGENCY_API_URL: runtime === "docker"
        ? `http://host.docker.internal:${Number(process.env.PORT ?? 3100)}`
        : `http://localhost:${Number(process.env.PORT ?? 3100)}`,
    },
    ...(channels ? { channels } : {}),
  };

  return config;
}

/**
 * Build auth-profiles.json from available credential sources.
 *
 * Priority order:
 *   1. DB settings (ai.oauth_access_token or ai.anthropic_api_key)
 *   2. Claude Code credentials (~/.claude/.credentials.json)
 *   3. OpenClaw profile (~/.openclaw/agents/main/agent/auth-profiles.json)
 */
export async function buildAuthProfiles(): Promise<Record<string, unknown>> {
  const mainAuthPath = path.join(HOME, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
  const claudeCredentialsPath = path.join(HOME, ".claude", ".credentials.json");

  let authFile: {
    version: number;
    profiles: Record<string, unknown>;
    lastGood: Record<string, string>;
    usageStats: Record<string, unknown>;
  };

  if (fs.existsSync(mainAuthPath)) {
    authFile = JSON.parse(fs.readFileSync(mainAuthPath, "utf-8"));
    authFile.usageStats = {};
  } else {
    authFile = { version: 1, profiles: {}, lastGood: {}, usageStats: {} };
  }

  const rows = await db
    .selectFrom("settings")
    .where("category", "=", "ai")
    .selectAll()
    .execute();

  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  const authMethod = s["ai.auth_method"] || "api_key";

  if (authMethod === "oauth" && s["ai.oauth_access_token"]) {
    // Source 1a: DB OAuth token
    authFile.profiles["anthropic:agency"] = {
      type: "token",
      provider: "anthropic",
      token: s["ai.oauth_access_token"],
    };
    if (!authFile.lastGood["anthropic"]) {
      authFile.lastGood["anthropic"] = "anthropic:agency";
    }
  } else if (s["ai.anthropic_api_key"]) {
    // Source 1b: DB API key
    authFile.profiles["anthropic:agency"] = {
      type: "token",
      provider: "anthropic",
      token: s["ai.anthropic_api_key"],
    };
    if (!authFile.lastGood["anthropic"]) {
      authFile.lastGood["anthropic"] = "anthropic:agency";
    }
  }

  // Source 2: Claude Code OAuth credentials (~/.claude/.credentials.json)
  if (Object.keys(authFile.profiles).length === 0 && fs.existsSync(claudeCredentialsPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(claudeCredentialsPath, "utf-8"));
      const oauth = creds.claudeAiOauth;
      if (oauth?.accessToken) {
        authFile.profiles["anthropic:claude-code"] = {
          type: "token",
          provider: "anthropic",
          token: oauth.accessToken,
        };
        authFile.lastGood["anthropic"] = "anthropic:claude-code";
        console.log("[provision] using Claude Code OAuth credentials from ~/.claude/.credentials.json");
      }
    } catch {
      // ignore parse errors
    }
  }

  if (Object.keys(authFile.profiles).length === 0) {
    throw new Error(
      "No auth credentials available. Either:\n" +
      "  - Configure in Settings → AI (API key or OAuth)\n" +
      "  - Log in with Claude Code: claude login\n" +
      "  - Run: openclaw configure"
    );
  }

  return authFile;
}

/**
 * Create a per-agent workspace with all role files and skills.
 * Uses symlinks to avoid duplicating role files.
 */
function buildAgentWorkspace(agentName: string, role: string): string {
  const profileDir = path.join(HOME, `.openclaw-${agentName}`);
  const workspaceDir = path.join(profileDir, "workspace");
  const roleDir = path.join(ROLES_DIR, role);

  // Clear and recreate workspace
  if (fs.existsSync(workspaceDir)) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Symlink all role files and directories
  if (fs.existsSync(roleDir)) {
    for (const entry of fs.readdirSync(roleDir)) {
      const src = path.join(roleDir, entry);
      const dest = path.join(workspaceDir, entry);
      try {
        fs.symlinkSync(src, dest);
      } catch {
        // Fall back to copy if symlink fails
        if (fs.statSync(src).isDirectory()) {
          fs.cpSync(src, dest, { recursive: true });
        } else {
          fs.copyFileSync(src, dest);
        }
      }
    }
  }

  // Write IDENTITY.md so the agent knows its own name
  const identity = `# Identity\n\nYour name is **${agentName}**. You are the "${agentName}" agent with the "${role}" role.\n\nWhen asked who you are, use your name — not "Claude" or any other default.\n`;
  fs.writeFileSync(path.join(workspaceDir, "IDENTITY.md"), identity);

  return workspaceDir;
}

/**
 * Provision an agent: write openclaw.json + auth-profiles.json to ~/.openclaw-<name>/.
 * Returns the paths written.
 */
export async function provisionAgent(
  agentName: string,
  role: string,
  runtime: string = "system",
  slackTokens?: { botToken?: string; appToken?: string },
): Promise<{ configPath: string; authPath: string }> {
  const profileDir = path.join(HOME, `.openclaw-${agentName}`);
  const configPath = path.join(profileDir, "openclaw.json");
  const authDir = path.join(profileDir, "agents", "main", "agent");
  const authPath = path.join(authDir, "auth-profiles.json");

  // Build per-agent workspace
  const workspace = buildAgentWorkspace(agentName, role);

  const [config, auth] = await Promise.all([
    buildOpenClawJson(agentName, role, runtime, workspace, slackTokens),
    buildAuthProfiles(),
  ]);

  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));

  console.log(`[provision] wrote ${configPath} + ${authPath}`);
  return { configPath, authPath };
}

/**
 * Push the full openclaw profile + role workspace to a remote host via rsync.
 */
export async function pushToRemote(
  agentName: string,
  role: string,
  host: string,
  machineName?: string,
): Promise<void> {
  const { getSSHConfig } = await import("./ssh.js");
  const config = await getSSHConfig(machineName);

  const profileDir = path.join(HOME, `.openclaw-${agentName}/`);
  const rolesDir = path.join(process.cwd(), `roles/${role}/`);

  // Rsync openclaw profile dir
  const configProc = Bun.spawn(
    ["rsync", "-az", "-e", config.sshCmd, profileDir, `${config.dest}:~/.openclaw-${agentName}/`],
    { stdout: "inherit", stderr: "inherit" },
  );
  // Rsync role workspace
  const rolesProc = Bun.spawn(
    ["rsync", "-az", "--delete", "-e", config.sshCmd, rolesDir, `${config.dest}:~/agency/roles/${role}/`],
    { stdout: "inherit", stderr: "inherit" },
  );

  const [configCode, rolesCode] = await Promise.all([configProc.exited, rolesProc.exited]);
  if (configCode !== 0) throw new Error(`rsync config to ${host} failed (exit ${configCode})`);
  if (rolesCode !== 0) throw new Error(`rsync roles to ${host} failed (exit ${rolesCode})`);

  console.log(`[provision] synced config+roles to ${agentName}@${host}`);
}

/**
 * Push openclaw config + auth into a running Docker container.
 */
export async function pushToDocker(agentName: string, role: string): Promise<void> {
  const profileDir = path.join(HOME, `.openclaw-${agentName}`);
  const container = `agent-${agentName}`;
  const containerProfileDir = `/root/.openclaw-${agentName}`;

  // Rewrite workspace paths in config for container context
  const configSrc = path.join(profileDir, "openclaw.json");
  const configRaw = fs.readFileSync(configSrc, "utf-8");
  const containerConfig = configRaw.replaceAll(profileDir, containerProfileDir);
  const tmpConfig = path.join(profileDir, "openclaw.docker.json");
  fs.writeFileSync(tmpConfig, containerConfig);

  // Create directory structure inside container (clear workspace to remove stale symlinks)
  const mkdirProc = Bun.spawn(
    ["docker", "exec", container, "sh", "-c",
      `rm -rf ${containerProfileDir}/workspace && mkdir -p ${containerProfileDir}/agents/main/agent ${containerProfileDir}/workspace`],
    { stdout: "inherit", stderr: "inherit" },
  );
  await mkdirProc.exited;

  // Copy rewritten openclaw.json
  const configProc = Bun.spawn(
    ["docker", "cp", tmpConfig, `${container}:${containerProfileDir}/openclaw.json`],
    { stdout: "inherit", stderr: "inherit" },
  );

  // Copy auth-profiles.json
  const authProc = Bun.spawn(
    ["docker", "cp", path.join(profileDir, "agents/main/agent/auth-profiles.json"),
      `${container}:${containerProfileDir}/agents/main/agent/auth-profiles.json`],
    { stdout: "inherit", stderr: "inherit" },
  );

  // Copy workspace files (role files) — use tar with --dereference to resolve
  // symlinks, since docker cp preserves them and the host paths don't exist in the container
  const workspaceDir = path.join(profileDir, "workspace");
  const tar = Bun.spawn(
    ["tar", "-ch", "--dereference", "-C", workspaceDir, "."],
    { stdout: "pipe", stderr: "inherit" },
  );
  const untar = Bun.spawn(
    ["docker", "cp", "-", `${container}:${containerProfileDir}/workspace`],
    { stdin: tar.stdout, stdout: "inherit", stderr: "inherit" },
  );

  const [configCode, authCode, workspaceCode] = await Promise.all([
    configProc.exited, authProc.exited, untar.exited,
  ]);
  if (configCode !== 0) console.error(`[provision] docker cp config to ${container} failed`);
  if (authCode !== 0) console.error(`[provision] docker cp auth to ${container} failed`);
  if (workspaceCode !== 0) console.error(`[provision] docker cp workspace to ${container} failed`);

  // Clean up temp file
  try { fs.unlinkSync(tmpConfig); } catch {}
}
