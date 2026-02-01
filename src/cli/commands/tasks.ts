import { api } from "../lib/api.js";
import { getConfig } from "../lib/config.js";

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

export default async function tasks(args: string[]) {
  const { agentName } = getConfig();
  const sub = args[0];
  const jsonMode = args.includes("--json");

  if (sub === "create") {
    const title = args[1];
    if (!title) { console.error("Usage: agency tasks create <title> [flags]"); process.exit(1); }
    const taskType = parseFlag(args, "--type") ?? "task";
    const priority = parseFlag(args, "--priority");
    const assign = parseFlag(args, "--assign");
    const design = parseFlag(args, "--design");
    const acceptance = parseFlag(args, "--acceptance");
    const description = parseFlag(args, "--description") ?? title;
    const from = parseFlag(args, "--from") ?? (agentName || "human");
    const parentId = parseFlag(args, "--parent");

    const task = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title, description, from,
        task_type: taskType,
        priority: priority ? Number(priority) : undefined,
        assign: assign ?? undefined,
        design: design ?? undefined,
        acceptance: acceptance ?? undefined,
        parent_id: parentId ?? undefined,
      }),
    });
    console.log(`Created task ${task.id}: ${task.title} [${task.status}]`);
    return;
  }

  if (sub === "list") {
    const status = parseFlag(args, "--status");
    const assignee = parseFlag(args, "--assignee");
    const type = parseFlag(args, "--type");
    const parent = parseFlag(args, "--parent");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (assignee) params.set("assignee", assignee);
    if (type) params.set("type", type);
    if (parent) params.set("parent_id", parent);
    const qs = params.toString() ? `?${params}` : "";
    const rows = await api(`/tasks${qs}`);
    if (jsonMode) { console.log(JSON.stringify(rows)); return; }
    if (rows.length === 0) {
      console.log("No tasks found.");
    } else {
      for (const t of rows) {
        console.log(`  ${t.id}  [${t.status.padEnd(10)}] P${t.priority} ${t.title}`);
      }
    }
    return;
  }

  if (sub === "ready") {
    const assignee = parseFlag(args, "--assignee") ?? agentName;
    if (!assignee) { console.error("Provide --assignee or set AGENCY_AGENT_NAME"); process.exit(1); }
    const rows = await api(`/tasks?status=assigned&assignee=${encodeURIComponent(assignee)}`);
    if (jsonMode) { console.log(JSON.stringify(rows)); return; }
    if (rows.length === 0) {
      console.log("No ready tasks.");
    } else {
      for (const t of rows) {
        console.log(`  ${t.id}  P${t.priority} ${t.title}`);
      }
    }
    return;
  }

  if (sub === "show") {
    const id = args[1];
    if (!id) { console.error("Usage: agency tasks show <id>"); process.exit(1); }
    const t = await api(`/tasks/${id}`);
    if (jsonMode) { console.log(JSON.stringify(t)); return; }
    console.log(`Task: ${t.id}`);
    console.log(`  Title: ${t.title}`);
    console.log(`  Status: ${t.status}`);
    console.log(`  Priority: ${t.priority}`);
    console.log(`  Type: ${t.task_type}`);
    console.log(`  Description: ${t.description}`);
    if (t.design) console.log(`  Design: ${t.design}`);
    if (t.acceptance) console.log(`  Acceptance: ${t.acceptance}`);
    if (t.assignees?.length) {
      console.log(`  Assignees: ${t.assignees.map((a: any) => a.name).join(", ")}`);
    }
    if (t.messages?.length) {
      console.log(`  Messages:`);
      for (const m of t.messages) {
        console.log(`    [${m.from_name ?? "?"}] ${m.content}`);
      }
    }
    return;
  }

  if (sub === "update") {
    const id = args[1];
    if (!id) { console.error("Usage: agency tasks update <id> [flags]"); process.exit(1); }
    const status = parseFlag(args, "--status");
    const priority = parseFlag(args, "--priority");
    const design = parseFlag(args, "--design");
    const acceptance = parseFlag(args, "--acceptance");
    const assign = parseFlag(args, "--assign");
    const from = parseFlag(args, "--from") ?? (agentName || "human");
    const body: any = { from };
    if (status) body.status = status;
    if (priority) body.priority = Number(priority);
    if (design) body.design = design;
    if (acceptance) body.acceptance = acceptance;

    const t = await api(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });

    if (assign) {
      await api(`/tasks/${id}/assign`, {
        method: "POST",
        body: JSON.stringify({ agentName: assign }),
      });
      console.log(`Updated task ${t.id}: [${t.status}] ${t.title} (assigned to ${assign})`);
    } else {
      console.log(`Updated task ${t.id}: [${t.status}] ${t.title}`);
    }
    return;
  }

  if (sub === "close") {
    const id = args[1];
    if (!id) { console.error("Usage: agency tasks close <id>"); process.exit(1); }
    const from = agentName || "human";
    const t = await api(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done", from }),
    });
    console.log(`Closed task ${t.id}: ${t.title}`);
    return;
  }

  console.error("Unknown tasks subcommand:", sub);
  console.log("Subcommands: create, list, ready, show, update, close");
  process.exit(1);
}
