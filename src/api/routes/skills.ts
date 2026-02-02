import { Hono } from "hono";
import { listSkills, getSkill, putSkill, deleteSkill } from "../lib/fs-store.js";
import { pushSkillsToAllAgents } from "../lib/sync-skills.js";
import { cloneRepo, scanSkills, cleanupRepo } from "../lib/import-skills.js";

export const skills = new Hono();

function withId(skill: { name: string; body: string; category: string; tags: string[] }) {
  return { id: skill.name, ...skill };
}

// List skills, optional ?category=, ?search=
skills.get("/", async (c) => {
  const category = c.req.query("category");
  const search = c.req.query("search")?.toLowerCase();

  let rows = listSkills();
  if (category) rows = rows.filter((r) => r.category === category);
  if (search) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.body.toLowerCase().includes(search)
    );
  }

  return c.json(rows.map(withId));
});

const KNOWN_REPOS = [
  "https://github.com/anthropics/skills",
  "https://github.com/obra/superpowers",
  "https://github.com/ComposioHQ/awesome-claude-skills",
];

// In-memory cache for available skills (5 min TTL)
let availableCache: { skills: { name: string; description: string; category: string; repo: string }[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// List all available skills from known repos (cached)
skills.get("/available", async (c) => {
  const force = c.req.query("refresh") === "1";
  if (!force && availableCache && Date.now() - availableCache.ts < CACHE_TTL) {
    return c.json(availableCache.skills);
  }

  const all: typeof availableCache["skills"] = [];
  await Promise.allSettled(
    KNOWN_REPOS.map(async (url) => {
      let repoDir: string | undefined;
      try {
        repoDir = await cloneRepo(url);
        const found = await scanSkills(repoDir);
        const repo = url.replace(/\.git$/, "").split("/").slice(-2).join("/");
        for (const s of found) {
          all.push({ name: s.name, description: s.description, category: s.category, repo });
        }
      } finally {
        if (repoDir) cleanupRepo(repoDir);
      }
    })
  );
  all.sort((a, b) => a.name.localeCompare(b.name));
  availableCache = { skills: all, ts: Date.now() };
  return c.json(all);
});

// Preview skills available in a GitHub repo
skills.get("/import/preview", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "url query param required" }, 400);

  let repoDir: string | undefined;
  try {
    repoDir = await cloneRepo(url);
    const available = await scanSkills(repoDir);
    const repoName = url.replace(/\.git$/, "").split("/").slice(-2).join("/");
    return c.json({ repo: repoName, skills: available.map(({ body: _, ...s }) => s) });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  } finally {
    if (repoDir) cleanupRepo(repoDir);
  }
});

// Import skills from a GitHub repo
skills.post("/import", async (c) => {
  const { url, skills: requested, overwrite } = await c.req.json<{
    url: string;
    skills?: string[];
    overwrite?: boolean;
  }>();
  if (!url) return c.json({ error: "url is required" }, 400);

  let repoDir: string | undefined;
  try {
    repoDir = await cloneRepo(url);
    let available = await scanSkills(repoDir);

    if (requested?.length) {
      const set = new Set(requested);
      available = available.filter((s) => set.has(s.name));
    }

    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const skill of available) {
      try {
        const existing = getSkill(skill.name);
        if (existing && !overwrite) {
          skipped.push(skill.name);
          continue;
        }
        putSkill(skill.name, skill.body, skill.category);
        imported.push(skill.name);
      } catch (err: any) {
        errors.push(`${skill.name}: ${err.message}`);
      }
    }

    pushSkillsToAllAgents().catch(() => {});
    return c.json({ imported, skipped, errors });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  } finally {
    if (repoDir) cleanupRepo(repoDir);
  }
});

// Get one skill by name
skills.get("/:name", async (c) => {
  const skill = getSkill(c.req.param("name"));
  if (!skill) return c.json({ error: "not found" }, 404);
  return c.json(withId(skill));
});

// Create skill
skills.post("/", async (c) => {
  const body = await c.req.json<{
    name: string; body: string; category?: string; tags?: string[];
  }>();

  putSkill(body.name, body.body, body.category ?? "general", body.tags ?? []);
  pushSkillsToAllAgents().catch(() => {});

  const skill = getSkill(body.name)!;
  return c.json(withId(skill), 201);
});

// Update skill
skills.put("/:name", async (c) => {
  const name = c.req.param("name");
  const existing = getSkill(name);
  if (!existing) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{
    name?: string; body?: string; category?: string; tags?: string[];
  }>();

  const newName = body.name ?? name;
  const newBody = body.body ?? existing.body;
  const newCategory = body.category ?? existing.category;
  const newTags = body.tags ?? existing.tags;

  // If renamed, delete old first
  if (newName !== name) {
    deleteSkill(name);
  }

  putSkill(newName, newBody, newCategory, newTags);
  pushSkillsToAllAgents().catch(() => {});

  return c.json(withId(getSkill(newName)!));
});

// Delete skill
skills.delete("/:name", async (c) => {
  deleteSkill(c.req.param("name"));
  pushSkillsToAllAgents().catch(() => {});
  return c.json({ ok: true });
});
