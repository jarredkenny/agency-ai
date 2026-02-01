import { Hono } from "hono";
import { db } from "../db/client.js";

export const settings = new Hono();

// List all settings, optional ?category=
settings.get("/", async (c) => {
  const category = c.req.query("category");
  let q = db.selectFrom("settings").selectAll();
  if (category) q = q.where("category", "=", category);
  const rows = await q.orderBy("category").orderBy("key").execute();
  return c.json(rows);
});

// Get one setting
settings.get("/:key", async (c) => {
  const key = c.req.param("key");
  const row = await db.selectFrom("settings").where("key", "=", key).selectAll().executeTakeFirst();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

// Upsert a setting
settings.put("/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json<{ value: string; category?: string; description?: string }>();

  const existing = await db.selectFrom("settings").where("key", "=", key).selectAll().executeTakeFirst();

  if (existing) {
    const updated = await db
      .updateTable("settings")
      .where("key", "=", key)
      .set({
        value: body.value,
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        updated_at: new Date().toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return c.json(updated);
  }

  const row = await db
    .insertInto("settings")
    .values({
      key,
      value: body.value,
      category: body.category ?? "general",
      description: body.description ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return c.json(row, 201);
});

// Delete a setting
settings.delete("/:key", async (c) => {
  const key = c.req.param("key");
  await db.deleteFrom("settings").where("key", "=", key).execute();
  return c.json({ ok: true });
});
