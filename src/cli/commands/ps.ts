import { api } from "../lib/api.js";

export default async function ps(_args: string[]) {
  const agents = await api("/agents");
  if (agents.length === 0) {
    console.log("No agents found.");
    return;
  }
  console.log("  NAME            STATUS     ROLE          LOCATION");
  console.log("  " + "─".repeat(60));
  for (const a of agents) {
    if (a.name === "human") continue;
    const name = (a.name ?? "").padEnd(15);
    const status = (a.status ?? "").padEnd(10);
    const role = (a.role ?? "").padEnd(13);
    const location = a.location ?? "";
    console.log(`  ${name} ${status} ${role} ${location}`);
  }
}
