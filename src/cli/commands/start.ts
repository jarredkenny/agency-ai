import { api } from "../lib/api.js";

export default async function start(args: string[]) {
  const name = args[0];
  if (!name) {
    console.error("Usage: agency start <agent-name>");
    process.exit(1);
  }
  const result = await api(`/agents/${name}/deploy`, { method: "POST" });
  console.log(`Started ${name}: ${result.status} (${result.method})`);
  if (result.instructions) {
    console.log(`  ${result.instructions}`);
  }
}
