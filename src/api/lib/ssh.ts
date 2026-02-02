import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readMachines, type Machine } from "../routes/machines.js";

export function getSSHConfigFromMachine(machine: Machine): { keyPath: string; user: string; host: string; port: number } {
  const user = machine.user || "ubuntu";
  const host = machine.host;
  const port = machine.port || 22;

  if (machine.auth === "key" && machine.ssh_key) {
    const keyDir = path.join(os.tmpdir(), "agency-ssh");
    fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
    const keyPath = path.join(keyDir, `key_${machine.name}`);
    fs.writeFileSync(keyPath, machine.ssh_key + "\n", { mode: 0o600 });
    return { keyPath, user, host, port };
  }

  throw new Error(`SSH key not configured for machine "${machine.name}". Add ssh_key in Settings → Machines.`);
}

export function getMachineByName(machineName?: string): Machine {
  const machines = readMachines();
  if (machines.length === 0) {
    throw new Error("No machines configured. Add one in Settings → Machines.");
  }

  if (machineName) {
    const machine = machines.find((m) => m.name === machineName);
    if (!machine) throw new Error(`Machine "${machineName}" not found.`);
    return machine;
  }

  return machines[0];
}

export async function getSSHConfig(machineName?: string): Promise<{ keyPath: string; user: string; host: string; port: number }> {
  const machine = getMachineByName(machineName);
  return getSSHConfigFromMachine(machine);
}

export async function sshExec(
  host: string,
  command: string,
  machineName?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { keyPath, user, port } = await getSSHConfig(machineName);

  const proc = Bun.spawn(
    [
      "ssh",
      "-i", keyPath,
      "-p", String(port),
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      `${user}@${host}`,
      command,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}
