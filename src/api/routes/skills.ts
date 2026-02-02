import { Hono } from "hono";
import { db } from "../db/client.js";
import { syncSkills, pushSkillsToAllAgents } from "../lib/sync-skills.js";
import { cloneRepo, scanSkills, cleanupRepo } from "../lib/import-skills.js";

export const skills = new Hono();

// List skills, optional ?category=, ?search=
skills.get("/", async (c) => {
  const category = c.req.query("category");
  const search = c.req.query("search");

  let q = db.selectFrom("skills").selectAll();
  if (category) q = q.where("category", "=", category);
  if (search) {
    q = q.where((eb) =>
      eb.or([
        eb("name", "like", `%${search}%`),
        eb("body", "like", `%${search}%`),
      ])
    );
  }

  const rows = await q.orderBy("name").execute();
  return c.json(rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) })));
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
        const existing = await db
          .selectFrom("skills")
          .where("name", "=", skill.name)
          .selectAll()
          .executeTakeFirst();

        if (existing && !overwrite) {
          skipped.push(skill.name);
          continue;
        }

        if (existing) {
          await db
            .updateTable("skills")
            .where("id", "=", existing.id)
            .set({ body: skill.body, category: skill.category, updated_at: new Date().toISOString() })
            .execute();
        } else {
          await db
            .insertInto("skills")
            .values({
              id: crypto.randomUUID(),
              name: skill.name,
              body: skill.body,
              category: skill.category,
              tags: JSON.stringify([]),
            })
            .execute();
        }
        imported.push(skill.name);
      } catch (err: any) {
        errors.push(`${skill.name}: ${err.message}`);
      }
    }

    await syncSkills();
    pushSkillsToAllAgents().catch(() => {});

    return c.json({ imported, skipped, errors });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  } finally {
    if (repoDir) cleanupRepo(repoDir);
  }
});

// Get one skill
skills.get("/:id", async (c) => {
  const row = await db.selectFrom("skills").where("id", "=", c.req.param("id")).selectAll().executeTakeFirst();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ...row, tags: JSON.parse(row.tags) });
});

// Create skill
skills.post("/", async (c) => {
  const body = await c.req.json<{
    name: string; body: string; category?: string; tags?: string[];
  }>();

  const row = await db
    .insertInto("skills")
    .values({
      id: crypto.randomUUID(),
      name: body.name,
      body: body.body,
      category: body.category ?? "general",
      tags: JSON.stringify(body.tags ?? []),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await syncSkills();
  pushSkillsToAllAgents().catch(() => {});
  return c.json({ ...row, tags: JSON.parse(row.tags) }, 201);
});

// Update skill
skills.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string; body?: string; category?: string; tags?: string[];
  }>();

  let q = db.updateTable("skills").where("id", "=", id);
  if (body.name !== undefined) q = q.set("name", body.name);
  if (body.body !== undefined) q = q.set("body", body.body);
  if (body.category !== undefined) q = q.set("category", body.category);
  if (body.tags !== undefined) q = q.set("tags", JSON.stringify(body.tags));
  q = q.set("updated_at", new Date().toISOString());

  const row = await q.returningAll().executeTakeFirstOrThrow();
  await syncSkills();
  pushSkillsToAllAgents().catch(() => {});
  return c.json({ ...row, tags: JSON.parse(row.tags) });
});

// Delete skill
skills.delete("/:id", async (c) => {
  await db.deleteFrom("skills").where("id", "=", c.req.param("id")).execute();
  await syncSkills();
  pushSkillsToAllAgents().catch(() => {});
  return c.json({ ok: true });
});
