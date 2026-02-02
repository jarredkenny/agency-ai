import { db } from "./client.js";
import * as fs from "fs";
import * as path from "path";
import {
  getRoleConfig,
  putRoleConfig,
  putSkill,
  configTypeToFilename,
} from "../lib/fs-store.js";

const TEMPLATES_DIR = path.join(import.meta.dir, "../../templates");

function readTemplate(...segments: string[]): string {
  const filePath = path.join(TEMPLATES_DIR, ...segments);
  return fs.readFileSync(filePath, "utf-8");
}

interface SeedOptions {
  userName?: string;
  teamName?: string;
  roles?: string[];
}

export async function seedDefaults(options: SeedOptions = {}) {
  const userName = options.userName ?? "Human";
  const teamName = options.teamName ?? "My Team";
  const roles = options.roles ?? ["orchestrator", "implementer"];

  // Seed default settings
  const defaultSettings: {
    key: string;
    value: string;
    category: string;
    description: string;
    sensitive: number;
    input_type: string;
  }[] = [
    // Identity
    { key: "user.name", value: userName, category: "identity", description: "Human operator name", sensitive: 0, input_type: "text" },
    { key: "user.email", value: "", category: "identity", description: "User email", sensitive: 0, input_type: "text" },
    { key: "team.name", value: teamName, category: "identity", description: "Team name", sensitive: 0, input_type: "text" },
    // AI
    { key: "ai.anthropic_api_key", value: "", category: "ai", description: "Anthropic API key", sensitive: 1, input_type: "password" },
    { key: "ai.auth_method", value: "api_key", category: "ai", description: "Auth method: api_key or oauth", sensitive: 0, input_type: "text" },
    { key: "ai.oauth_access_token", value: "", category: "ai", description: "Claude OAuth access token", sensitive: 1, input_type: "password" },
    { key: "ai.oauth_refresh_token", value: "", category: "ai", description: "Claude OAuth refresh token", sensitive: 1, input_type: "password" },
    { key: "ai.oauth_expires_at", value: "", category: "ai", description: "Token expiry (ISO string)", sensitive: 0, input_type: "readonly" },
    { key: "ai.oauth_subscription_type", value: "", category: "ai", description: "Subscription type (max, pro, etc.)", sensitive: 0, input_type: "readonly" },
    // OpenClaw Agent Defaults
    { key: "agent.model", value: "claude-sonnet-4-20250514", category: "agent", description: "Primary model for all agents", sensitive: 0, input_type: "text" },
    { key: "agent.model_fallbacks", value: "", category: "agent", description: "Comma-separated fallback models", sensitive: 0, input_type: "text" },
    { key: "agent.thinking", value: "low", category: "agent", description: "Extended thinking mode: off, low, medium, high", sensitive: 0, input_type: "select:off,low,medium,high" },
    { key: "agent.timeout_seconds", value: "600", category: "agent", description: "Agent run timeout in seconds", sensitive: 0, input_type: "text" },
    { key: "agent.max_concurrent", value: "1", category: "agent", description: "Max parallel agent runs per instance", sensitive: 0, input_type: "text" },
    { key: "agent.sandbox_mode", value: "non-main", category: "agent", description: "Sandboxing: off, non-main, always", sensitive: 0, input_type: "select:off,non-main,always" },
    { key: "agent.sandbox_scope", value: "agent", category: "agent", description: "Sandbox lifecycle: agent, session, message", sensitive: 0, input_type: "select:agent,session,message" },
    { key: "agent.tools_profile", value: "full", category: "agent", description: "Tool allowlist profile: full, standard, minimal", sensitive: 0, input_type: "select:full,standard,minimal" },
    { key: "agent.tools_allow", value: "", category: "agent", description: "Comma-separated tool allowlist (overrides profile)", sensitive: 0, input_type: "text" },
    { key: "agent.tools_deny", value: "", category: "agent", description: "Comma-separated tool denylist", sensitive: 0, input_type: "text" },
    { key: "agent.web_search", value: "true", category: "agent", description: "Enable web search tool", sensitive: 0, input_type: "select:true,false" },
    { key: "agent.exec_timeout_sec", value: "1800", category: "agent", description: "Process execution kill timeout (seconds)", sensitive: 0, input_type: "text" },
    { key: "agent.browser_enabled", value: "true", category: "agent", description: "Start managed browser instance", sensitive: 0, input_type: "select:true,false" },
    { key: "agent.logging_level", value: "info", category: "agent", description: "Log verbosity: debug, info, warn, error", sensitive: 0, input_type: "select:debug,info,warn,error" },
    { key: "agent.logging_redact", value: "tools", category: "agent", description: "Redact sensitive data: off, tools, all", sensitive: 0, input_type: "select:off,tools,all" },
    { key: "agent.context_pruning", value: "adaptive", category: "agent", description: "Context pruning mode: off, adaptive, aggressive", sensitive: 0, input_type: "select:off,adaptive,aggressive" },
    { key: "agent.compaction", value: "default", category: "agent", description: "Memory compaction: off, default, aggressive", sensitive: 0, input_type: "select:off,default,aggressive" },
    { key: "agent.heartbeat_interval", value: "30m", category: "agent", description: "Heartbeat check interval (e.g. 30m, 1h)", sensitive: 0, input_type: "text" },
  ];

  for (const s of defaultSettings) {
    const existing = await db.selectFrom("settings").where("key", "=", s.key).selectAll().executeTakeFirst();
    if (!existing) {
      await db.insertInto("settings").values(s).execute();
      console.log(`[seed] setting: ${s.key}`);
    }
  }

  // Clean up removed settings
  const removedKeys = [
    "slack.team_channel", "slack.human_user_id", "ssh.key_path", "aws.profile",
    "aws.access_key_id", "aws.secret_access_key", "aws.region", "aws.ami_id",
    "aws.instance_type", "aws.s3_bucket_prefix",
    "ssh.private_key", "ssh.public_key", "ssh.key_name", "ssh.user",
  ];
  for (const key of removedKeys) {
    await db.deleteFrom("settings").where("key", "=", key).execute();
  }

  // Migrate old categories
  await db.updateTable("settings").where("key", "=", "user.name").set({ category: "identity" }).execute();
  await db.updateTable("settings").where("key", "=", "team.name").set({ category: "identity" }).execute();

  // Helper to replace template variables
  function interpolate(content: string): string {
    return content
      .replace(/\{\{user\.name\}\}/g, userName)
      .replace(/\{\{team\.name\}\}/g, teamName);
  }

  // Migrate existing DB role_configs to filesystem (one-time)
  try {
    const dbConfigs = await db.selectFrom("role_configs").selectAll().execute();
    for (const row of dbConfigs) {
      if (getRoleConfig(row.role, row.config_type) === null) {
        putRoleConfig(row.role, row.config_type, row.content);
        console.log(`[seed] migrated role_config to fs: ${row.role}/${row.config_type}`);
      }
    }
  } catch {
    // Table may not exist if fresh install — that's fine
  }

  // Migrate existing DB skills to filesystem (one-time)
  try {
    const dbSkills = await db.selectFrom("skills").selectAll().execute();
    for (const row of dbSkills) {
      const { getSkill } = await import("../lib/fs-store.js");
      if (!getSkill(row.name)) {
        const tags = JSON.parse(row.tags) as string[];
        putSkill(row.name, row.body, row.category, tags);
        console.log(`[seed] migrated skill to fs: ${row.name}`);
      }
    }
  } catch {
    // Table may not exist — fine
  }

  // Seed role configs to filesystem from templates
  const ROLE_SPECIFIC = ["heartbeat", "agents-config", "tools", "agents"];
  const SHARED_CONFIGS: { configType: string; template: string }[] = [
    { configType: "environment", template: "environment.md" },
    { configType: "soul", template: "soul.md" },
    { configType: "identity", template: "user.md" },
  ];

  for (const role of roles) {
    const templateRole = fs.existsSync(path.join(TEMPLATES_DIR, role)) ? role : "implementer";
    const configs = [
      ...ROLE_SPECIFIC.map((ct) => ({ configType: ct, segments: [templateRole, `${ct}.md`] })),
      ...SHARED_CONFIGS.map((c) => ({ configType: c.configType, segments: ["shared", c.template] })),
    ];

    for (const { configType, segments } of configs) {
      if (getRoleConfig(role, configType) === null) {
        const content = interpolate(readTemplate(...segments));
        putRoleConfig(role, configType, content);
        console.log(`[seed] role_config: ${role}/${configType}`);
      }
    }
  }

  // Ensure "human" agent exists
  const humanExists = await db
    .selectFrom("agents")
    .where("name", "=", "human")
    .selectAll()
    .executeTakeFirst();

  if (!humanExists) {
    await db.insertInto("agents").values({
      id: crypto.randomUUID(),
      name: "human",
      role: "human",
      status: "active",
      current_task: null,
      session_key: "agent:human:main",
    }).execute();
    console.log("[seed] created human agent");
  }
}

// Run directly if executed as a script
if (import.meta.main) {
  await seedDefaults();
  await db.destroy();
}
