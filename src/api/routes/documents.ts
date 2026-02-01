import { Hono } from "hono";
import { db } from "../db/client.js";
import { resolveAgent } from "../lib/resolve-agent.js";
import { logActivity } from "../lib/activity.js";

export const documents = new Hono();

documents.get("/", async (c) => {
  const taskId = c.req.query("task_id");
  let q = db.selectFrom("documents").selectAll();
  if (taskId) q = q.where("task_id", "=", taskId);
  const rows = await q.orderBy("created_at", "desc").execute();
  return c.json(rows);
});

documents.get("/:id", async (c) => {
  const doc = await db.selectFrom("documents").where("id", "=", c.req.param("id")).selectAll().executeTakeFirst();
  if (!doc) return c.json({ error: "not found" }, 404);
  return c.json(doc);
});

documents.post("/", async (c) => {
  const body = await c.req.json<{
    title: string; content: string; doc_type?: string;
    task_id?: string; from: string;
  }>();
  const agent = await resolveAgent(body.from);
  if (!agent) return c.json({ error: "unknown agent" }, 400);

  const doc = await db.insertInto("documents").values({
    id: crypto.randomUUID(),
    title: body.title,
    content: body.content,
    doc_type: body.doc_type ?? "general",
    task_id: body.task_id ?? null,
    created_by: agent.id,
  }).returningAll().executeTakeFirstOrThrow();

  await logActivity("document_created", agent.id, `Created doc: ${doc.title}`, doc.task_id);
  return c.json(doc, 201);
});
