import { join } from "path";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  existsSync,
  rmSync,
} from "fs";
import { parseFrontmatter } from "./import-skills.js";

const ROLES_DIR = join(process.cwd(), "roles");
const CLAUDE_SKILLS_DIR = join(process.cwd(), ".claude", "skills");

// Config type <-> filename mapping
const CONFIG_TO_FILE: Record<string, string> = {
  soul: "SOUL.md",
  identity: "USER.md",
  agents: "AGENTS.md",
  tools: "TOOLS.md",
  heartbeat: "HEARTBEAT.md",
  environment: "ENVIRONMENT.md",
  "agents-config": "AGENTS-CONFIG.md",
};

const FILE_TO_CONFIG: Record<string, string> = {};
for (const [k, v] of Object.entries(CONFIG_TO_FILE)) {
  FILE_TO_CONFIG[v] = k;
}

export function configTypeToFilename(configType: string): string {
  return CONFIG_TO_FILE[configType] ?? `${configType.toUpperCase()}.md`;
}

export function filenameToConfigType(filename: string): string | null {
  return FILE_TO_CONFIG[filename] ?? null;
}

// ── Roles ──

export function listRoles(): string[] {
  if (!existsSync(ROLES_DIR)) return [];
  return readdirSync(ROLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
}

// ── Role Configs ──

export function listRoleConfigs(role?: string): {
  role: string;
  config_type: string;
  content: string;
}[] {
  const roles = role ? [role] : listRoles();
  const results: { role: string; config_type: string; content: string }[] = [];

  for (const r of roles) {
    const dir = join(ROLES_DIR, r);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".md")) continue;
      const ct = filenameToConfigType(entry);
      if (!ct) continue;
      const content = readFileSync(join(dir, entry), "utf-8");
      results.push({ role: r, config_type: ct, content });
    }
  }

  return results.sort((a, b) =>
    a.role.localeCompare(b.role) || a.config_type.localeCompare(b.config_type)
  );
}

export function getRoleConfig(
  role: string,
  configType: string
): string | null {
  const filename = configTypeToFilename(configType);
  const filePath = join(ROLES_DIR, role, filename);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

export function putRoleConfig(
  role: string,
  configType: string,
  content: string
): void {
  const filename = configTypeToFilename(configType);
  const dir = join(ROLES_DIR, role);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content);
}

export function deleteRoleConfig(
  role: string,
  configType: string
): boolean {
  const filename = configTypeToFilename(configType);
  const filePath = join(ROLES_DIR, role, filename);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

// ── Skills ──

function skillToMd(skill: {
  name: string;
  body: string;
  category: string;
  tags: string[];
}): string {
  const lines = [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.name}`,
    `category: ${skill.category}`,
    ...(skill.tags.length ? [`tags: [${skill.tags.join(", ")}]`] : []),
    "---",
    "",
    skill.body,
  ];
  return lines.join("\n");
}

function parseSkillMd(
  name: string,
  content: string
): { name: string; body: string; category: string; tags: string[] } {
  const { meta, body } = parseFrontmatter(content);
  const rawTags = meta.tags || "";
  let tags: string[] = [];
  if (rawTags) {
    tags = rawTags
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return {
    name: meta.name || name,
    body,
    category: meta.category || "general",
    tags,
  };
}

export function listSkills(): {
  name: string;
  body: string;
  category: string;
  tags: string[];
}[] {
  const seen = new Map<
    string,
    { name: string; body: string; category: string; tags: string[] }
  >();

  // Scan all roles for skills
  for (const role of listRoles()) {
    const skillsDir = join(ROLES_DIR, role, "skills");
    if (!existsSync(skillsDir)) continue;
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      if (seen.has(entry.name)) continue;
      const content = readFileSync(skillFile, "utf-8");
      seen.set(entry.name, parseSkillMd(entry.name, content));
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function getSkill(
  name: string
): { name: string; body: string; category: string; tags: string[] } | null {
  for (const role of listRoles()) {
    const skillFile = join(ROLES_DIR, role, "skills", name, "SKILL.md");
    if (existsSync(skillFile)) {
      return parseSkillMd(name, readFileSync(skillFile, "utf-8"));
    }
  }
  return null;
}

export function putSkill(
  name: string,
  body: string,
  category: string = "general",
  tags: string[] = []
): void {
  const md = skillToMd({ name, body, category, tags });

  // Write to all role dirs
  for (const role of listRoles()) {
    const skillDir = join(ROLES_DIR, role, "skills", name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), md);
  }

  // Write to .claude/skills/
  const claudeDir = join(CLAUDE_SKILLS_DIR, name);
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "SKILL.md"), md);
}

export function deleteSkill(name: string): void {
  // Remove from all role dirs
  for (const role of listRoles()) {
    const skillDir = join(ROLES_DIR, role, "skills", name);
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true, force: true });
    }
  }

  // Remove from .claude/skills/
  const claudeDir = join(CLAUDE_SKILLS_DIR, name);
  if (existsSync(claudeDir)) {
    rmSync(claudeDir, { recursive: true, force: true });
  }
}
