import { Hono } from "hono";
import { db } from "../db/client.js";

export const settings = new Hono();

const MASKED = "********";

// List all settings, optional ?category=
settings.get("/", async (c) => {
  const category = c.req.query("category");
  let q = db.selectFrom("settings").selectAll();
  if (category) q = q.where("category", "=", category);
  const rows = await q.orderBy("category").orderBy("key").execute();
  // Mask sensitive values
  const masked = rows.map((r) => ({
    ...r,
    value: r.sensitive ? MASKED : r.value,
  }));
  return c.json(masked);
});

// Get one setting
settings.get("/:key", async (c) => {
  const key = c.req.param("key");
  const row = await db.selectFrom("settings").where("key", "=", key).selectAll().executeTakeFirst();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({
    ...row,
    value: row.sensitive ? MASKED : row.value,
  });
});

// Upsert a setting
settings.put("/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json<{
    value: string;
    category?: string;
    description?: string;
    sensitive?: number;
    input_type?: string;
  }>();

  // If value is the mask placeholder, skip updating value (user didn't change it)
  const skipValue = body.value === MASKED;

  const existing = await db.selectFrom("settings").where("key", "=", key).selectAll().executeTakeFirst();

  if (existing) {
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (!skipValue) updates.value = body.value;
    if (body.category !== undefined) updates.category = body.category;
    if (body.description !== undefined) updates.description = body.description;
    if (body.sensitive !== undefined) updates.sensitive = body.sensitive;
    if (body.input_type !== undefined) updates.input_type = body.input_type;

    const updated = await db
      .updateTable("settings")
      .where("key", "=", key)
      .set(updates)
      .returningAll()
      .executeTakeFirstOrThrow();
    return c.json({
      ...updated,
      value: updated.sensitive ? MASKED : updated.value,
    });
  }

  const row = await db
    .insertInto("settings")
    .values({
      key,
      value: skipValue ? "" : body.value,
      category: body.category ?? "general",
      description: body.description ?? null,
      sensitive: body.sensitive ?? 0,
      input_type: body.input_type ?? "text",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return c.json({
    ...row,
    value: row.sensitive ? MASKED : row.value,
  }, 201);
});

// Delete a setting
settings.delete("/:key", async (c) => {
  const key = c.req.param("key");
  await db.deleteFrom("settings").where("key", "=", key).execute();
  return c.json({ ok: true });
});
