import { Hono } from "hono";
import { db } from "../db/client.js";

export const activities = new Hono();

activities.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const since = c.req.query("since");

  let q = db
    .selectFrom("activities")
    .innerJoin("agents", "agents.id", "activities.agent_id")
    .select([
      "activities.id", "activities.type", "activities.agent_id",
      "activities.task_id", "activities.summary", "activities.created_at",
      "agents.name as agent_name",
    ])
    .orderBy("activities.created_at", "desc")
    .limit(limit);

  if (since) {
    q = q.where("activities.created_at", ">=", new Date(since));
  }

  const rows = await q.execute();
  return c.json(rows);
});
