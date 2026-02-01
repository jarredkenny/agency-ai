import { db } from "../db/client.js";

export async function parseMentions(
  content: string,
  excludeAgentId: string
): Promise<string[]> {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  if (mentions.length === 0) return [];

  // Handle @all
  if (mentions.includes("all")) {
    const agents = await db
      .selectFrom("agents")
      .where("id", "!=", excludeAgentId)
      .select("id")
      .execute();
    return agents.map((a) => a.id);
  }

  // Resolve named mentions
  const agents = await db
    .selectFrom("agents")
    .where("name", "in", mentions)
    .where("id", "!=", excludeAgentId)
    .select("id")
    .execute();
  return agents.map((a) => a.id);
}

export async function getTaskSubscribers(
  taskId: string,
  excludeAgentId: string
): Promise<string[]> {
  const assignees = await db
    .selectFrom("task_assignees")
    .where("task_id", "=", taskId)
    .where("agent_id", "!=", excludeAgentId)
    .select("agent_id")
    .execute();

  const messageAuthors = await db
    .selectFrom("messages")
    .where("task_id", "=", taskId)
    .where("from_agent", "!=", excludeAgentId)
    .select("from_agent")
    .distinct()
    .execute();

  const ids = new Set<string>();
  for (const a of assignees) ids.add(a.agent_id);
  for (const m of messageAuthors) ids.add(m.from_agent);
  return [...ids];
}
