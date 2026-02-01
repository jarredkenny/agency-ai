import { Hono } from "hono";
import { db } from "../db/client.js";

export const roleConfigs = new Hono();

// List all role configs, optional ?role=
roleConfigs.get("/", async (c) => {
  const role = c.req.query("role");
  let q = db.selectFrom("role_configs").selectAll();
  if (role) q = q.where("role", "=", role);
  const rows = await q.orderBy("role").orderBy("config_type").execute();
  return c.json(rows);
});

// Get one role config by role + config_type
roleConfigs.get("/:role/:configType", async (c) => {
  const row = await db
    .selectFrom("role_configs")
    .where("role", "=", c.req.param("role"))
    .where("config_type", "=", c.req.param("configType"))
    .selectAll()
    .executeTakeFirst();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

// Upsert a role config
roleConfigs.put("/:role/:configType", async (c) => {
  const role = c.req.param("role");
  const configType = c.req.param("configType");
  const { content } = await c.req.json<{ content: string }>();

  const existing = await db
    .selectFrom("role_configs")
    .where("role", "=", role)
    .where("config_type", "=", configType)
    .selectAll()
    .executeTakeFirst();

  if (existing) {
    const updated = await db
      .updateTable("role_configs")
      .where("id", "=", existing.id)
      .set({ content, updated_at: new Date().toISOString() })
      .returningAll()
      .executeTakeFirstOrThrow();
    return c.json(updated);
  }

  const row = await db
    .insertInto("role_configs")
    .values({
      id: crypto.randomUUID(),
      role,
      config_type: configType,
      content,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return c.json(row, 201);
});

// Delete a role config
roleConfigs.delete("/:role/:configType", async (c) => {
  await db
    .deleteFrom("role_configs")
    .where("role", "=", c.req.param("role"))
    .where("config_type", "=", c.req.param("configType"))
    .execute();
  return c.json({ ok: true });
});
