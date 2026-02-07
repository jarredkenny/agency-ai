import type { Subprocess } from "bun";
import { db } from "../db/client.js";
import { provisionAgent, gatewayPort } from "./provision-openclaw.js";
import { getEnvVars } from "./env-vars.js";

const localProcesses = new Map<string, Subprocess>();

/**
 * Scan for already-running openclaw gateway processes and reconcile agent
 * statuses in the DB. This handles daemon restarts where the gateway
 * processes survive but the in-memory localProcesses map is lost.
 */
export async function reconcileRunningProcesses(): Promise<void> {
  try {
    const proc = Bun.spawn(
      ["ps", "axo", "pid,args"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    if (exitCode !== 0) return;

    // Find running openclaw gateway processes and extract profile names
    const runningProfiles = new Set<string>();
    for (const line of stdout.split("\n")) {
      // Match lines like: "1226 openclaw --profile sonny gateway run --port 19123"
      // or: "1226 openclaw-gateway" with OPENCLAW_PROFILE env
      const profileMatch = line.match(/openclaw\s+--profile\s+(\S+)\s+gateway/);
      if (profileMatch) {
        runningProfiles.add(profileMatch[1]);
      }
    }

    // Also check processes that run as openclaw-gateway (binary name) by reading their environ
    for (const line of stdout.split("\n")) {
      const pidMatch = line.match(/^\s*(\d+)\s+.*openclaw-gateway/);
      if (pidMatch) {
        try {
          const environ = await Bun.file(`/proc/${pidMatch[1]}/environ`).text();
          const profileEnv = environ.split("\0").find((e) => e.startsWith("OPENCLAW_PROFILE="));
          if (profileEnv) {
            runningProfiles.add(profileEnv.split("=")[1]);
          }
        } catch {
          // Can't read environ — skip
        }
      }
    }

    if (runningProfiles.size === 0) return;

    // Update DB status for agents whose gateway is actually running
    const agents = await db.selectFrom("agents").selectAll().execute();
    for (const agent of agents) {
      if (runningProfiles.has(agent.name) && agent.status !== "active") {
        await db
          .updateTable("agents")
          .where("id", "=", agent.id)
          .set({ status: "active", updated_at: new Date().toISOString() })
          .execute();
        console.log(`[process] reconciled ${agent.name}: marking active (gateway running as pid)`);
      }
    }
  } catch (err) {
    console.error("[process] reconcileRunningProcesses error:", err);
  }
}

export async function startLocal(name: string, role: string): Promise<Subprocess> {
  const existing = localProcesses.get(name);
  if (existing) {
    existing.kill();
    localProcesses.delete(name);
  }

  // Ensure config + auth are written before starting
  await provisionAgent(name, role, "system");

  const port = gatewayPort(name, "system");
  const proc = Bun.spawn(
    ["openclaw", "--profile", name, "gateway", "run", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...(await getEnvVars()), AGENCY_AGENT_NAME: name },
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
