import { Hono } from "hono";
import { db } from "../db/client.js";
import { resolveAgent } from "../lib/resolve-agent.js";

export const notifications = new Hono();

notifications.get("/pending", async (c) => {
  const rows = await db
    .selectFrom("notifications")
    .innerJoin("agents", "agents.id", "notifications.target_agent")
    .where("delivered", "=", 0)
    .select([
      "notifications.id", "notifications.target_agent", "notifications.source_agent",
      "notifications.task_id", "notifications.content", "notifications.delivered",
      "notifications.created_at",
      "agents.name as target_name", "agents.session_key",
    ])
    .orderBy("notifications.created_at", "asc")
    .execute();
  return c.json(rows);
});

notifications.get("/pending/:agentName", async (c) => {
  const agent = await resolveAgent(c.req.param("agentName"));
  if (!agent) return c.json({ error: "not found" }, 404);
  const rows = await db
    .selectFrom("notifications")
    .where("target_agent", "=", agent.id)
    .where("delivered", "=", 0)
    .selectAll()
    .orderBy("created_at", "asc")
    .execute();
  return c.json(rows);
});

notifications.post("/deliver/:id", async (c) => {
  const id = c.req.param("id");
  await db.updateTable("notifications").where("id", "=", id).set("delivered", 1).execute();
  return c.json({ ok: true });
});
