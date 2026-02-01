import { api } from "../lib/api.js";

export default async function status(args: string[]) {
  const name = args[0];

  if (name) {
    const agent = await api(`/agents/${name}`);
    console.log(`Agent: ${agent.name}`);
    console.log(`  Role: ${agent.role ?? "n/a"}`);
    console.log(`  Status: ${agent.status}`);
    console.log(`  Current task: ${agent.current_task ?? "none"}`);
    console.log(`  Updated: ${agent.updated_at}`);
    return;
  }

  // General health check
  try {
    const data = await api("/health");
    console.log(`API: ${data.status}`);
  } catch (err: any) {
    console.log(`API: unreachable (${err.message})`);
    return;
  }

  const agents = await api("/agents");
  const active = agents.filter((a: any) => a.status === "active" && a.name !== "human");
  const total = agents.filter((a: any) => a.name !== "human");
  console.log(`Agents: ${active.length}/${total.length} active`);

  for (const a of total) {
    console.log(`  ${a.name.padEnd(15)} ${(a.status ?? "").padEnd(10)} ${a.role ?? ""}`);
  }
}
