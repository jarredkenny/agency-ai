import { api } from "../lib/api.js";

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

export default async function skills(args: string[]) {
  const sub = args[0];

  if (sub === "list" || !sub) {
    const category = parseFlag(args, "--category");
    const search = parseFlag(args, "--search");
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    const qs = params.toString() ? `?${params}` : "";
    const rows = await api(`/skills${qs}`);
    if (rows.length === 0) {
      console.log("No skills found.");
    } else {
      for (const s of rows) {
        const tags = s.tags?.length ? ` [${s.tags.join(", ")}]` : "";
        console.log(`  ${s.id.slice(0, 8)}  ${s.name}${tags}`);
      }
    }
    return;
  }

  if (sub === "show") {
    const id = args[1];
    if (!id) { console.error("Usage: agency skills show <id>"); process.exit(1); }
    const s = await api(`/skills/${id}`);
    console.log(`Skill: ${s.name}`);
    console.log(`  Category: ${s.category}`);
    console.log(`  Tags: ${s.tags?.join(", ") || "none"}`);
    console.log(`  Body:\n${s.body}`);
    return;
  }

  if (sub === "create") {
    const name = args[1];
    if (!name) { console.error("Usage: agency skills create <name> [--category C]"); process.exit(1); }
    const category = parseFlag(args, "--category");
    const body = await Bun.stdin.text();
    const s = await api("/skills", {
      method: "POST",
      body: JSON.stringify({ name, body: body || `# ${name}\n`, category }),
    });
    console.log(`Created skill ${s.id}: ${s.name}`);
    return;
  }

  if (sub === "delete") {
    const id = args[1];
    if (!id) { console.error("Usage: agency skills delete <id>"); process.exit(1); }
    await api(`/skills/${id}`, { method: "DELETE" });
    console.log(`Deleted skill ${id}`);
    return;
  }

  console.error("Unknown skills subcommand:", sub);
  console.log("Subcommands: list, show, create, delete");
  process.exit(1);
}
