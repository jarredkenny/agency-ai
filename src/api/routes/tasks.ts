import { Hono } from "hono";
import { db } from "../db/client.js";
import { resolveAgent } from "../lib/resolve-agent.js";
import { logActivity } from "../lib/activity.js";

export const tasks = new Hono();

tasks.get("/", async (c) => {
  const { status, assignee, type, parent_id } = c.req.query();
  let q = db.selectFrom("tasks").selectAll();

  if (status) q = q.where("status", "=", status);
  if (type) q = q.where("task_type", "=", type);
  if (parent_id) q = q.where("parent_id", "=", parent_id);

  if (assignee) {
    const agent = await resolveAgent(assignee);
    if (!agent) return c.json([]);
    q = q.where("id", "in",
      db.selectFrom("task_assignees").where("agent_id", "=", agent.id).select("task_id")
    );
  }

  const rows = await q.orderBy("created_at", "desc").execute();
  return c.json(rows);
});

tasks.get("/:id", async (c) => {
  const id = c.req.param("id");
  const task = await db.selectFrom("tasks").where("id", "=", id).selectAll().executeTakeFirst();
  if (!task) return c.json({ error: "not found" }, 404);

  const assignees = await db
    .selectFrom("task_assignees")
    .innerJoin("agents", "agents.id", "task_assignees.agent_id")
    .where("task_id", "=", id)
    .selectAll("agents")
    .execute();

  const messages = await db
    .selectFrom("messages")
    .leftJoin("agents", "agents.id", "messages.from_agent")
    .where("task_id", "=", id)
    .select([
      "messages.id", "messages.task_id", "messages.from_agent",
      "messages.content", "messages.created_at",
      "agents.name as from_name",
    ])
    .orderBy("messages.created_at", "asc")
    .execute();

  const documents = await db
    .selectFrom("documents")
    .where("task_id", "=", id)
    .selectAll()
    .execute();

  return c.json({ ...task, assignees, messages, documents });
});

tasks.post("/", async (c) => {
  const body = await c.req.json<{
    title: string; description: string; from: string;
    design?: string; acceptance?: string; priority?: number;
    task_type?: string; parent_id?: string; assign?: string;
  }>();
  const agent = await resolveAgent(body.from);
  if (!agent) return c.json({ error: "unknown agent" }, 400);

  const task = await db.insertInto("tasks").values({
    id: crypto.randomUUID(),
    title: body.title,
    description: body.description,
    created_by: agent.id,
    design: body.design ?? null,
    acceptance: body.acceptance ?? null,
    priority: body.priority ?? 2,
    task_type: body.task_type ?? "task",
    parent_id: body.parent_id ?? null,
    status: body.assign ? "assigned" : "inbox",
  }).returningAll().executeTakeFirstOrThrow();

  await logActivity("task_created", agent.id, `Created task: ${task.title}`, task.id);

  if (body.assign) {
    const assignee = await resolveAgent(body.assign);
    if (assignee) {
      await db.insertInto("task_assignees").values({ task_id: task.id, agent_id: assignee.id }).execute();
    }
  }

  return c.json(task, 201);
});

tasks.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    status?: string; priority?: number; description?: string;
    design?: string; acceptance?: string; title?: string; from: string;
  }>();
  const agent = await resolveAgent(body.from);
  if (!agent) return c.json({ error: "unknown agent" }, 400);

  let q = db.updateTable("tasks").where("id", "=", id);
  if (body.status !== undefined) q = q.set("status", body.status);
  if (body.priority !== undefined) q = q.set("priority", body.priority);
  if (body.description !== undefined) q = q.set("description", body.description);
  if (body.design !== undefined) q = q.set("design", body.design);
  if (body.acceptance !== undefined) q = q.set("acceptance", body.acceptance);
  if (body.title !== undefined) q = q.set("title", body.title);
  q = q.set("updated_at", new Date().toISOString());

  const updated = await q.returningAll().executeTakeFirstOrThrow();

  if (body.status) {
    await logActivity("status_changed", agent.id, `Status → ${body.status}`, id);
  }

  return c.json(updated);
});

tasks.post("/:id/assign", async (c) => {
  const id = c.req.param("id");
  const { agentName } = await c.req.json<{ agentName: string }>();
  const agent = await resolveAgent(agentName);
  if (!agent) return c.json({ error: "unknown agent" }, 400);

  await db.insertInto("task_assignees").values({ task_id: id, agent_id: agent.id }).execute();

  // inbox → assigned
  await db.updateTable("tasks")
    .where("id", "=", id)
    .where("status", "=", "inbox")
    .set("status", "assigned")
    .set("updated_at", new Date().toISOString())
    .execute();

  await logActivity("assigned", agent.id, `Assigned to ${agentName}`, id);
  return c.json({ ok: true });
});

tasks.delete("/:id/assign/:agent", async (c) => {
  const id = c.req.param("id");
  const agentName = c.req.param("agent");
  const agent = await resolveAgent(agentName);
  if (!agent) return c.json({ error: "unknown agent" }, 400);

  await db.deleteFrom("task_assignees")
    .where("task_id", "=", id)
    .where("agent_id", "=", agent.id)
    .execute();

  return c.json({ ok: true });
});
