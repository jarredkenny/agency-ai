import { api } from "../lib/api.js";

export default async function recall(args: string[]) {
  const search = args.join(" ");
  if (!search) {
    console.error("Usage: agency recall <search...>");
    process.exit(1);
  }
  const rows = await api(`/knowledge?search=${encodeURIComponent(search)}`);
  if (rows.length === 0) {
    console.log("No knowledge found.");
  } else {
    for (const r of rows) {
      console.log(`  [${r.key}] ${r.content}`);
      if (r.tags?.length) console.log(`    tags: ${r.tags.join(", ")}`);
    }
  }
}
