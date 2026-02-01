import { db } from "../db/client.js";

export async function logActivity(
  type: string,
  agentId: string,
  summary: string,
  taskId?: string | null
) {
  await db.insertInto("activities").values({
    id: crypto.randomUUID(),
    type, agent_id: agentId, task_id: taskId ?? null, summary,
  }).execute();
}
