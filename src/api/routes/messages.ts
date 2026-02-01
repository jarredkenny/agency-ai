import { Hono } from "hono";
import { db } from "../db/client.js";
import { resolveAgent } from "../lib/resolve-agent.js";
import { logActivity } from "../lib/activity.js";
import { parseMentions, getTaskSubscribers } from "../lib/mentions.js";

export const messages = new Hono();

messages.get("/:taskId/messages", async (c) => {
  const taskId = c.req.param("taskId");
  const rows = await db
    .selectFrom("messages")
    .leftJoin("agents", "agents.id", "messages.from_agent")
    .where("task_id", "=", taskId)
    .select([
      "messages.id", "messages.task_id", "messages.from_agent",
      "messages.content", "messages.created_at",
      "agents.name as from_name",
    ])
    .orderBy("messages.created_at", "asc")
    .execute();
  return c.json(rows);
});

messages.post("/:taskId/messages", async (c) => {
  const taskId = c.req.param("taskId");
  const { from, content } = await c.req.json<{ from: string; content: string }>();
  const agent = await resolveAgent(from);
  if (!agent) return c.json({ error: "unknown agent" }, 400);

  const msg = await db.insertInto("messages").values({
    id: crypto.randomUUID(),
    task_id: taskId, from_agent: agent.id, content,
  }).returningAll().executeTakeFirstOrThrow();

  // Collect notification targets
  const mentionIds = await parseMentions(content, agent.id);
  const subscriberIds = await getTaskSubscribers(taskId, agent.id);
  const targetIds = new Set([...mentionIds, ...subscriberIds]);

  // Create notifications
  for (const targetId of targetIds) {
    await db.insertInto("notifications").values({
      id: crypto.randomUUID(),
      target_agent: targetId,
      source_agent: agent.id,
      task_id: taskId,
      content: `${from}: ${content}`,
    }).execute();
  }

  await logActivity("message", agent.id, `Message on task`, taskId);
  return c.json(msg, 201);
});
