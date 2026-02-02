import type { Subprocess } from "bun";
import { db } from "../db/client.js";
import { provisionAgent, gatewayPort } from "./provision-openclaw.js";

const localProcesses = new Map<string, Subprocess>();

export async function startLocal(name: string, role: string): Promise<Subprocess> {
  const existing = localProcesses.get(name);
  if (existing) {
    existing.kill();
    localProcesses.delete(name);
  }

  // Ensure config + auth are written before starting
  await provisionAgent(name, role, "local");

  const port = gatewayPort(name, "local");
  const proc = Bun.spawn(
    ["openclaw", "--profile", name, "gateway", "run", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env },
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  localProcesses.set(name, proc);

  proc.exited.then((code) => {
    if (localProcesses.get(name) === proc) {
      localProcesses.delete(name);
    }
    console.log(`[process] ${name} gateway exited with code ${code}`);
    db.updateTable("agents").set({ status: "idle" }).where("name", "=", name).execute().catch(console.error);
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
