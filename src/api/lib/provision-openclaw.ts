import * as fs from "fs";
import * as path from "path";
import { db } from "../db/client.js";

const HOME = process.env.HOME ?? "";

/**
 * Deterministic gateway port from agent name.
 * Local agents each need a unique port; EC2/Docker always use 18789 (isolated).
 */
export function gatewayPort(name: string, location: string): number {
  if (location !== "local") return 18789;
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
  location: string,
): Promise<Record<string, unknown>> {
  const rows = await db
    .selectFrom("settings")
    .where("category", "=", "agent")
    .selectAll()
    .execute();

  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  const workspace = path.resolve(process.cwd(), `roles/${role}`);
  const port = gatewayPort(agentName, location);

  // Agent defaults
  const defaults: Record<string, unknown> = {
    workspace,
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
  defaults.contextPruning = { mode: s["agent.context_pruning"] || "adaptive" };
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

  const config: Record<string, unknown> = {
    agents: {
      defaults,
      list: [
        { id: "main" },
        { id: agentName, name: agentName, workspace },
      ],
    },
    tools,
    browser: { enabled: s["agent.browser_enabled"] !== "false" },
    logging: {
      level: s["agent.logging_level"] || "info",
      redactSensitive: s["agent.logging_redact"] || "tools",
    },
    gateway: {
      mode: "local",
      port,
      bind: "loopback",
    },
    commands: { native: "auto", restart: true },
  };

  return config;
}

/**
 * Build auth-profiles.json from main openclaw profile + DB credentials.
 * (Merged from provision-auth.ts)
 */
export async function buildAuthProfiles(): Promise<Record<string, unknown>> {
  const mainAuthPath = path.join(HOME, ".openclaw", "agents", "main", "agent", "auth-profiles.json");

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
    authFile.profiles["anthropic:agency"] = {
      type: "token",
      provider: "anthropic",
      token: s["ai.oauth_access_token"],
    };
    if (!authFile.lastGood["anthropic"]) {
      authFile.lastGood["anthropic"] = "anthropic:agency";
    }
  } else if (s["ai.anthropic_api_key"]) {
    authFile.profiles["anthropic:agency"] = {
      type: "token",
      provider: "anthropic",
      token: s["ai.anthropic_api_key"],
    };
    if (!authFile.lastGood["anthropic"]) {
      authFile.lastGood["anthropic"] = "anthropic:agency";
    }
  }

  if (Object.keys(authFile.profiles).length === 0) {
    throw new Error("No auth credentials available. Configure in Settings → AI or run 'openclaw configure'.");
  }

  return authFile;
}

/**
 * Provision an agent: write openclaw.json + auth-profiles.json to ~/.openclaw-<name>/.
 * Returns the paths written.
 */
export async function provisionAgent(
  agentName: string,
  role: string,
  location: string = "local",
): Promise<{ configPath: string; authPath: string }> {
  const profileDir = path.join(HOME, `.openclaw-${agentName}`);
  const configPath = path.join(profileDir, "openclaw.json");
  const authDir = path.join(profileDir, "agents", "main", "agent");
  const authPath = path.join(authDir, "auth-profiles.json");

  const [config, auth] = await Promise.all([
    buildOpenClawJson(agentName, role, location),
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
 * Push the full openclaw profile + role workspace to a remote EC2 host via rsync.
 */
export async function pushToRemote(
  agentName: string,
  role: string,
  host: string,
  machineName?: string,
): Promise<void> {
  const { getSSHConfig } = await import("./ssh.js");
  const { keyPath, user, port } = await getSSHConfig(machineName);
  const sshOpt = `ssh -i ${keyPath} -p ${port} -o StrictHostKeyChecking=no`;

  const profileDir = path.join(HOME, `.openclaw-${agentName}/`);
  const rolesDir = path.join(process.cwd(), `roles/${role}/`);

  // Rsync openclaw profile dir
  const configProc = Bun.spawn(
    ["rsync", "-az", "-e", sshOpt, profileDir, `${user}@${host}:~/.openclaw-${agentName}/`],
    { stdout: "inherit", stderr: "inherit" },
  );
  // Rsync role workspace
  const rolesProc = Bun.spawn(
    ["rsync", "-az", "--delete", "-e", sshOpt, rolesDir, `${user}@${host}:~/agency/roles/${role}/`],
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

  // Copy openclaw.json
  const configProc = Bun.spawn(
    ["docker", "cp", path.join(profileDir, "openclaw.json"), `${container}:/root/.openclaw-${agentName}/openclaw.json`],
    { stdout: "inherit", stderr: "inherit" },
  );

  // Copy auth-profiles.json
  const authProc = Bun.spawn(
    ["docker", "cp", path.join(profileDir, "agents/main/agent/auth-profiles.json"),
      `${container}:/root/.openclaw-${agentName}/agents/main/agent/auth-profiles.json`],
    { stdout: "inherit", stderr: "inherit" },
  );

  const [configCode, authCode] = await Promise.all([configProc.exited, authProc.exited]);
  if (configCode !== 0) console.error(`[provision] docker cp config to ${container} failed`);
  if (authCode !== 0) console.error(`[provision] docker cp auth to ${container} failed`);
}
