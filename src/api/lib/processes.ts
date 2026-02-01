import type { Subprocess } from "bun";

const localProcesses = new Map<string, Subprocess>();

export function startLocal(name: string, role: string): Subprocess {
  const existing = localProcesses.get(name);
  if (existing) {
    existing.kill();
    localProcesses.delete(name);
  }

  const proc = Bun.spawn(["bun", "packages/agent/src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENCY_AGENT_NAME: name,
      AGENCY_ROLE: role,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  localProcesses.set(name, proc);

  // Clean up map entry when process exits
  proc.exited.then(() => {
    if (localProcesses.get(name) === proc) {
      localProcesses.delete(name);
    }
  });

  return proc;
}

export function stopLocal(name: string): boolean {
  const proc = localProcesses.get(name);
  if (!proc) return false;
  proc.kill();
  localProcesses.delete(name);
  return true;
}

export function isLocalRunning(name: string): boolean {
  return localProcesses.has(name);
}
