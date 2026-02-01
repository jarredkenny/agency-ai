import { Hono } from "hono";
import { db } from "../db/client.js";
import { resolveAgent } from "../lib/resolve-agent.js";

export const knowledge = new Hono();

knowledge.get("/", async (c) => {
  const tags = c.req.query("tags");
  const search = c.req.query("search");

  let q = db.selectFrom("knowledge").selectAll();

  if (tags) {
    const tagArr = tags.split(",");
    for (const tag of tagArr) {
      q = q.where("tags", "like", `%"${tag}"%`);
    }
  }

  if (search) {
    q = q.where((eb) =>
      eb.or([
        eb("content", "like", `%${search}%`),
        eb("key", "like", `%${search}%`),
      ])
    );
  }

  const rows = await q.orderBy("created_at", "desc").execute();
  return c.json(rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) })));
});

knowledge.post("/", async (c) => {
  const body = await c.req.json<{
    key: string; content: string; from: string;
    task_id?: string; tags?: string[];
  }>();
  const agent = await resolveAgent(body.from);
  if (!agent) return c.json({ error: "unknown agent" }, 400);

  const tagsJson = JSON.stringify(body.tags ?? []);

  const row = await db.insertInto("knowledge").values({
    id: crypto.randomUUID(),
    key: body.key,
    content: body.content,
    source: agent.id,
    task_id: body.task_id ?? null,
    tags: tagsJson,
  })
  .onConflict((oc) => oc.column("key").doUpdateSet({
    content: body.content,
    source: agent.id,
    tags: tagsJson,
  }))
  .returningAll()
  .executeTakeFirstOrThrow();

  return c.json({ ...row, tags: JSON.parse(row.tags) }, 201);
});
