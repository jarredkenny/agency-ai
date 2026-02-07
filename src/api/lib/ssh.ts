import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readMachines, type Machine } from "../routes/machines.js";

export interface SSHConfig {
  /** Full ssh arg list up to (but not including) user@host */
  args: string[];
  user: string;
  host: string;
  port: number;
  /** For rsync -e: the ssh command string with flags */
  sshCmd: string;
  /** user@host convenience */
  dest: string;
}

export function getSSHConfigFromMachine(machine: Machine): SSHConfig {
  const user = machine.user || "ubuntu";
  const host = machine.host;
  const port = machine.port || 22;
  const dest = `${user}@${host}`;

  if (machine.auth === "key") {
    if (!machine.ssh_key) {
      throw new Error(`SSH key not configured for machine "${machine.name}". Add ssh_key in Settings → Machines.`);
    }
    const keyDir = path.join(os.tmpdir(), "agency-ssh");
    fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
    const keyPath = path.join(keyDir, `key_${machine.name}`);
    fs.writeFileSync(keyPath, machine.ssh_key + "\n", { mode: 0o600 });

    const args = [
      "ssh",
      "-i", keyPath,
      "-p", String(port),
      "-o", "StrictHostKeyChecking=no",
    ];
    const sshCmd = `ssh -i ${keyPath} -p ${port} -o StrictHostKeyChecking=no`;
    return { args, user, host, port, sshCmd, dest };
  }

  // Password auth via sshpass
  if (!machine.password) {
    throw new Error(`Password not configured for machine "${machine.name}". Add password in Settings → Machines.`);
  }

  const args = [
    "sshpass", "-p", machine.password,
    "ssh",
    "-p", String(port),
    "-o", "StrictHostKeyChecking=no",
  ];
  const sshCmd = `sshpass -p ${machine.password} ssh -p ${port} -o StrictHostKeyChecking=no`;
  return { args, user, host, port, sshCmd, dest };
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

export async function getSSHConfig(machineName?: string): Promise<SSHConfig> {
  const machine = getMachineByName(machineName);
  return getSSHConfigFromMachine(machine);
}

export async function sshExec(
  host: string,
  command: string,
  machineName?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const config = await getSSHConfig(machineName);

  const proc = Bun.spawn(
    [...config.args, "-o", "ConnectTimeout=10", config.dest, command],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}
