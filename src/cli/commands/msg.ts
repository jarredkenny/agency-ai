import { api } from "../lib/api.js";
import { getConfig } from "../lib/config.js";

export default async function msg(args: string[]) {
  const taskId = args[0];
  const content = args.slice(1).join(" ");
  if (!taskId || !content) {
    console.error("Usage: agency msg <task-id> <message...>");
    process.exit(1);
  }
  const { agentName } = getConfig();
  const from = agentName || "human";
  const m = await api(`/tasks/${taskId}/messages`, {
    method: "POST",
    body: JSON.stringify({ from, content }),
  });
  console.log(`Message posted on task ${taskId} (id: ${m.id})`);
}
