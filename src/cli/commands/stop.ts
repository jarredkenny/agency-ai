import { api } from "../lib/api.js";

export default async function stop(args: string[]) {
  const name = args[0];
  if (!name) {
    console.error("Usage: agency stop <agent-name>");
    process.exit(1);
  }
  const result = await api(`/agents/${name}/stop`, { method: "POST" });
  console.log(`Stopped ${name}: ${result.status}`);
}
