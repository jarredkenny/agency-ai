import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Glob } from "bun";

export interface ParsedSkill {
  name: string;
  description: string;
  category: string;
  body: string;
}

export async function cloneRepo(url: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "skill-import-"));
  const proc = Bun.spawn(["git", "clone", "--depth", "1", url, dir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`git clone failed: ${stderr.trim()}`);
  }
  return dir;
}

export function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { meta, body: match[2] };
}

export async function scanSkills(repoDir: string): Promise<ParsedSkill[]> {
  // Try skills/ subdir first, fall back to repo root
  const skillsDir = existsSync(join(repoDir, "skills")) ? join(repoDir, "skills") : repoDir;

  const results: ParsedSkill[] = [];
  const seen = new Set<string>();

  // Scan for */SKILL.md and **/*/SKILL.md (for nested like document-skills/pdf/)
  for (const pattern of ["*/SKILL.md", "*/*/SKILL.md"]) {
    const glob = new Glob(pattern);
    for await (const path of glob.scan({ cwd: skillsDir, absolute: false })) {
      const parts = path.split("/");
      const name = parts[parts.length - 2]; // dir containing SKILL.md
      if (seen.has(name)) continue;
      // Skip common non-skill dirs
      if (name === ".git" || name === "node_modules" || name === ".github") continue;
      seen.add(name);
      const content = readFileSync(join(skillsDir, path), "utf-8");
      const { meta, body } = parseFrontmatter(content);
      results.push({
        name: meta.name || name,
        description: meta.description || "",
        category: meta.category || "general",
        body,
      });
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function cleanupRepo(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
