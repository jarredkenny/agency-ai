import { api } from "../lib/api.js";
import { getSSHConfigFromMachine } from "../../api/lib/ssh.js";
import { readMachines } from "../../api/routes/machines.js";

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

  // SSH requires a non-local machine
  const machineName = agent.machine;
  if (!machineName) {
    console.error(`No machine configured for "${name}". Select a machine in the agent settings.`);
    process.exit(1);
  }

  const machines = readMachines();
  const machine = machines.find((m) => m.name === machineName);
  if (!machine) {
    console.error(`Machine "${machineName}" not found. Configure it in Settings → Machines.`);
    process.exit(1);
  }

  if (machine.auth === "local") {
    console.error(`SSH is only supported for remote agents. "${name}" is on local machine "${machineName}".`);
    process.exit(1);
  }

  const config = getSSHConfigFromMachine(machine);

  // Exec ssh
  const proc = Bun.spawn(
    [...config.args, config.dest, ...args.slice(1)],
    { stdout: "inherit", stderr: "inherit", stdin: "inherit" }
  );
  const code = await proc.exited;
  process.exit(code);
}
