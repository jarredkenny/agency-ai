import { api } from "../lib/api.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export default async function ssh(args: string[]) {
  const name = args[0];
  if (!name) {
    console.error("Usage: agency ssh <agent-name>");
    process.exit(1);
  }

  const agent = await api(`/agents/${name}`);
  if (!agent) {
    console.error(`Agent "${name}" not found.`);
    process.exit(1);
  }

  if (agent.location !== "remote") {
    console.error(`SSH is only supported for remote agents. "${name}" is ${agent.location ?? "local"}.`);
    process.exit(1);
  }

  const machineName = agent.machine;
  if (!machineName) {
    console.error(`No machine configured for "${name}". Select a machine in the agent settings.`);
    process.exit(1);
  }

  // Get machine config from machines API
  const machines = await api("/machines");
  const machine = machines.find((m: any) => m.name === machineName);
  if (!machine) {
    console.error(`Machine "${machineName}" not found. Configure it in Settings → Machines.`);
    process.exit(1);
  }

  // For SSH key, we need the raw key — read from machines.json directly
  const machinesPath = path.resolve(process.cwd(), ".agency", "machines.json");
  let rawMachines: any[] = [];
  try {
    rawMachines = JSON.parse(fs.readFileSync(machinesPath, "utf-8"));
  } catch {
    console.error("Could not read machines.json");
    process.exit(1);
  }

  const rawMachine = rawMachines.find((m: any) => m.name === machineName);
  if (!rawMachine?.ssh_key) {
    console.error(`SSH key not configured for machine "${machineName}".`);
    process.exit(1);
  }

  // Write key to temp file
  const keyDir = path.join(os.tmpdir(), "agency-ssh");
  fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(keyDir, `key_${machineName}`);
  fs.writeFileSync(keyPath, rawMachine.ssh_key + "\n", { mode: 0o600 });

  const user = rawMachine.user || "ubuntu";
  const host = rawMachine.host;
  const port = String(rawMachine.port || 22);

  // Exec ssh
  const proc = Bun.spawn(
    ["ssh", "-i", keyPath, "-p", port, "-o", "StrictHostKeyChecking=no", `${user}@${host}`, ...args.slice(1)],
    { stdout: "inherit", stderr: "inherit", stdin: "inherit" }
  );
  const code = await proc.exited;
  process.exit(code);
}
