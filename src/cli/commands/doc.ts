import { api } from "../lib/api.js";
import { getConfig } from "../lib/config.js";

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

export default async function doc(args: string[]) {
  const sub = args[0];
  const { agentName } = getConfig();

  if (sub === "create") {
    const title = args[1];
    if (!title) {
      console.error("Usage: agency doc create <title> --task <id> [--type T]");
      process.exit(1);
    }
    const taskId = parseFlag(args, "--task");
    const docType = parseFlag(args, "--type") ?? "general";
    const from = agentName || "human";
    const content = await Bun.stdin.text();
    const d = await api("/documents", {
      method: "POST",
      body: JSON.stringify({ title, content, doc_type: docType, task_id: taskId, from }),
    });
    console.log(`Created document ${d.id}: ${d.title} (${d.doc_type})`);
    return;
  }

  if (sub === "show") {
    const id = args[1];
    if (!id) { console.error("Usage: agency doc show <id>"); process.exit(1); }
    const d = await api(`/documents/${id}`);
    console.log(`Document: ${d.id}`);
    console.log(`  Title: ${d.title}`);
    console.log(`  Type: ${d.doc_type}`);
    console.log(`  Task: ${d.task_id ?? "none"}`);
    console.log(`  Content:\n${d.content}`);
    return;
  }

  console.error("Unknown doc subcommand:", sub);
  console.log("Subcommands: create, show");
  process.exit(1);
}
