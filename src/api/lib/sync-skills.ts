import { db } from "../db/client.js";
import { join } from "path";
import { mkdirSync, rmSync, readdirSync, existsSync, writeFileSync } from "fs";
import { getSSHConfig } from "./ssh.js";

function skillToMd(skill: { name: string; body: string; category: string; tags: string }) {
  const tags = JSON.parse(skill.tags) as string[];
  const lines = [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.name}`,
    `category: ${skill.category}`,
    ...(tags.length ? [`tags: [${tags.join(", ")}]`] : []),
    "---",
    "",
    skill.body,
  ];
  return lines.join("\n");
}

export async function syncSkills() {
  const skills = await db.selectFrom("skills").selectAll().execute();
  const skillNames = new Set(skills.map((s) => s.name));

  // Sync to all existing role workspaces
  const rolesDir = join(process.cwd(), "roles");
  if (existsSync(rolesDir)) {
    for (const role of readdirSync(rolesDir)) {
      const skillsDir = join(rolesDir, role, "skills");
      syncToDir(skillsDir, skills, skillNames);
    }
  }

  // Sync to .claude/skills/ for Claude Code in worktrees
  const claudeSkillsDir = join(process.cwd(), ".claude", "skills");
  syncToDir(claudeSkillsDir, skills, skillNames);
}

function syncToDir(
  dir: string,
  skills: { name: string; body: string; category: string; tags: string }[],
  skillNames: Set<string>,
) {
  mkdirSync(dir, { recursive: true });

  // Write each skill
  for (const skill of skills) {
    const skillDir = join(dir, skill.name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), skillToMd(skill));
  }

  // Remove stale
  for (const entry of readdirSync(dir)) {
    if (!skillNames.has(entry)) {
      rmSync(join(dir, entry), { recursive: true, force: true });
    }
  }
}

export async function pushSkillsToAgent(agent: {
  name: string;
  role: string;
  location: string;
}): Promise<void> {
  if (agent.location === "local") return;

  const skillsSource = join(process.cwd(), `roles/${agent.role}/skills/`);
  if (!existsSync(skillsSource)) return;

  if (agent.location === "ec2") {
    const { readFleet } = await import("./fleet-sync.js");
    const fleet = readFleet();
    const host = fleet.agents[agent.name]?.host;
    if (!host) return;

    const { keyPath, user } = await getSSHConfig();
    const proc = Bun.spawn(
      [
        "rsync",
        "-az",
        "--delete",
        "-e",
        `ssh -i ${keyPath} -o StrictHostKeyChecking=no`,
        skillsSource,
        `${user}@${host}:~/agency/roles/${agent.role}/skills/`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`[sync-skills] rsync to ${agent.name} failed (exit ${code})`);
    }
  }

  if (agent.location === "docker") {
    const proc = Bun.spawn(
      [
        "docker",
        "cp",
        `${skillsSource}.`,
        `agent-${agent.name}:/app/roles/${agent.role}/skills`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`[sync-skills] docker cp to ${agent.name} failed (exit ${code})`);
    }
  }
}

export async function pushSkillsToAllAgents(): Promise<void> {
  const agents = await db
    .selectFrom("agents")
    .where("status", "=", "active")
    .selectAll()
    .execute();

  await Promise.allSettled(
    agents.map((a) =>
      pushSkillsToAgent({ name: a.name, role: a.role, location: a.location ?? "local" }),
    ),
  );
}
