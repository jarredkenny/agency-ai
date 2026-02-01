import { Hono } from "hono";
import { db } from "../db/client.js";

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
  return c.json({ ...row, tags: JSON.parse(row.tags) });
});

// Delete skill
skills.delete("/:id", async (c) => {
  await db.deleteFrom("skills").where("id", "=", c.req.param("id")).execute();
  return c.json({ ok: true });
});
