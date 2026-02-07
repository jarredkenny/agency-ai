import type { Machine } from "../routes/machines.js";
import { getSSHConfigFromMachine } from "./ssh.js";

/**
 * Execute a command on a machine — locally if auth=local, via SSH otherwise.
 */
export async function exec(
  machine: Machine,
  cmd: string[],
  opts?: { stdin?: Uint8Array; stdout?: "pipe" | "inherit" | "ignore" },
): Promise<{ exitCode: number; stdout: string }> {
  const stdoutMode = opts?.stdout ?? "pipe";

  if (machine.auth === "local") {
    const proc = Bun.spawn(cmd, {
      stdout: stdoutMode,
      stderr: "inherit",
      stdin: opts?.stdin ?? "ignore",
    });
    const [exitCode, out] = await Promise.all([
      proc.exited,
      stdoutMode === "pipe" ? new Response(proc.stdout).text() : Promise.resolve(""),
    ]);
    return { exitCode, stdout: out };
  }

  // Remote: wrap in SSH
  const config = getSSHConfigFromMachine(machine);
  const shellCmd = cmd.map((c) => `'${c.replace(/'/g, "'\\''")}'`).join(" ");
  const proc = Bun.spawn(
    [...config.args, "-o", "ConnectTimeout=10", config.dest, shellCmd],
    { stdout: stdoutMode, stderr: "inherit", stdin: opts?.stdin ?? "ignore" },
  );
  const [exitCode, out] = await Promise.all([
    proc.exited,
    stdoutMode === "pipe" ? new Response(proc.stdout).text() : Promise.resolve(""),
  ]);
  return { exitCode, stdout: out };
}

/**
 * Push a file to a machine via rsync (no-op if local).
 */
export async function pushFile(
  machine: Machine,
  localPath: string,
  remotePath: string,
): Promise<void> {
  if (machine.auth === "local") return; // file is already local

  const config = getSSHConfigFromMachine(machine);
  const proc = Bun.spawn(
    ["rsync", "-az", "-e", config.sshCmd, localPath, `${config.dest}:${remotePath}`],
    { stdout: "inherit", stderr: "inherit" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`rsync to ${machine.name} failed (exit ${exitCode})`);
}

/**
 * Push a directory to a machine via rsync (no-op if local).
 */
export async function pushDir(
  machine: Machine,
  localDir: string,
  remoteDir: string,
): Promise<void> {
  if (machine.auth === "local") return;

  const config = getSSHConfigFromMachine(machine);
  const proc = Bun.spawn(
    ["rsync", "-az", "--delete", "-e", config.sshCmd, localDir + "/", `${config.dest}:${remoteDir}/`],
    { stdout: "inherit", stderr: "inherit" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`rsync dir to ${machine.name} failed (exit ${exitCode})`);
}
