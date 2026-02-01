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
  const defaultSettings: { key: string; value: string; category: string; description: string }[] = [
    { key: "team.name", value: teamName, category: "general", description: "Team name" },
    { key: "user.name", value: userName, category: "general", description: "Human operator name" },
    { key: "slack.team_channel", value: "", category: "slack", description: "Slack channel ID" },
    { key: "slack.human_user_id", value: "", category: "slack", description: "Human's Slack user ID" },
    { key: "aws.profile", value: "", category: "aws", description: "AWS CLI profile" },
    { key: "aws.region", value: "", category: "aws", description: "AWS region" },
    { key: "aws.ami_id", value: "", category: "aws", description: "AMI for EC2 agents" },
    { key: "aws.instance_type", value: "", category: "aws", description: "Default EC2 instance type" },
    { key: "aws.s3_bucket_prefix", value: "", category: "aws", description: "S3 bucket prefix" },
    { key: "ssh.key_name", value: "", category: "ssh", description: "SSH key name" },
    { key: "ssh.key_path", value: "", category: "ssh", description: "Path to SSH key" },
    { key: "ssh.user", value: "", category: "ssh", description: "SSH username" },
  ];

  for (const s of defaultSettings) {
    const existing = await db.selectFrom("settings").where("key", "=", s.key).selectAll().executeTakeFirst();
    if (!existing) {
      await db.insertInto("settings").values(s).execute();
      console.log(`[seed] setting: ${s.key}`);
    }
  }

  // Helper to replace template variables
  function interpolate(content: string): string {
    return content
      .replace(/\{\{user\.name\}\}/g, userName)
      .replace(/\{\{team\.name\}\}/g, teamName);
  }

  // Seed role configs for each role
  // Role-specific configs map to templates at <role>/<name>.md
  // Shared configs (soul, identity, environment) fall back to shared/<name>.md
  const ROLE_SPECIFIC = ["heartbeat", "agents-config", "tools", "agents"];
  const SHARED_CONFIGS: { configType: string; template: string }[] = [
    { configType: "environment", template: "environment.md" },
    { configType: "soul", template: "soul.md" },
    { configType: "identity", template: "user.md" },
  ];

  for (const role of roles) {
    // Role-specific templates: <role>/<configType>.md
    // Falls back to implementer if the role dir doesn't exist
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
