import { db } from "./client.js";
import * as fs from "fs";
import * as path from "path";

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
    // AWS
    { key: "aws.access_key_id", value: "", category: "aws", description: "AWS Access Key ID", sensitive: 1, input_type: "password" },
    { key: "aws.secret_access_key", value: "", category: "aws", description: "AWS Secret Access Key", sensitive: 1, input_type: "password" },
    { key: "aws.region", value: "", category: "aws", description: "AWS region", sensitive: 0, input_type: "text" },
    { key: "aws.ami_id", value: "", category: "aws", description: "AMI for EC2 agents", sensitive: 0, input_type: "text" },
    { key: "aws.instance_type", value: "", category: "aws", description: "Default EC2 instance type", sensitive: 0, input_type: "text" },
    { key: "aws.s3_bucket_prefix", value: "", category: "aws", description: "S3 bucket prefix", sensitive: 0, input_type: "text" },
    // SSH
    { key: "ssh.private_key", value: "", category: "ssh", description: "SSH private key content", sensitive: 1, input_type: "textarea" },
    { key: "ssh.public_key", value: "", category: "ssh", description: "SSH public key (for display/copy)", sensitive: 0, input_type: "textarea" },
    { key: "ssh.key_name", value: "", category: "ssh", description: "SSH key name", sensitive: 0, input_type: "text" },
    { key: "ssh.user", value: "", category: "ssh", description: "SSH username", sensitive: 0, input_type: "text" },
  ];

  for (const s of defaultSettings) {
    const existing = await db.selectFrom("settings").where("key", "=", s.key).selectAll().executeTakeFirst();
    if (!existing) {
      await db.insertInto("settings").values(s).execute();
      console.log(`[seed] setting: ${s.key}`);
    }
  }

  // Clean up removed settings
  const removedKeys = ["slack.team_channel", "slack.human_user_id", "ssh.key_path", "aws.profile"];
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

  // Seed role configs for each role
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
      const existing = await db
        .selectFrom("role_configs")
        .where("role", "=", role)
        .where("config_type", "=", configType)
        .selectAll()
        .executeTakeFirst();

      if (!existing) {
        const content = interpolate(readTemplate(...segments));
        await db.insertInto("role_configs").values({
          id: crypto.randomUUID(),
          role,
          config_type: configType,
          content,
        }).execute();
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
