import * as path from "path";
import { findAgencyRoot } from "./cli/lib/find-root.js";

// Resolve .agency/ and set environment
const agencyRoot = findAgencyRoot();
if (agencyRoot) {
  process.env.DATABASE_PATH ??= path.join(agencyRoot, "agency.db");
  process.env.FLEET_PATH ??= path.join(agencyRoot, "fleet.json");
}

// Start API server explicitly (Bun auto-serve only works for main entry)
console.log("[daemon] starting API server...");
const apiModule = await import("./api/index.js");
const server = Bun.serve({
  port: apiModule.default.port,
  hostname: apiModule.default.hostname,
  fetch: apiModule.default.fetch,
});
console.log(`[daemon] API listening on http://${server.hostname}:${server.port}`);

// Run migrations + seed new settings on startup
const { runMigrations } = await import("./api/db/migrate.js");
await runMigrations();
const { seedDefaults } = await import("./api/db/seed.js");
await seedDefaults();

// Migrate fleet.json: location → runtime + machine (before fleet sync)
{
  const { readFleet } = await import("./api/lib/fleet-sync.js");
  const { readMachines } = await import("./api/routes/machines.js");
  const fleet = readFleet();
  const machines = readMachines();
  const localMachine = machines.find((m) => m.auth === "local");
  let fleetDirty = false;

  for (const [name, fa] of Object.entries(fleet.agents)) {
    if ((fa as any).location && !fa.runtime) {
      const loc = (fa as any).location as string;
      if (loc === "docker") {
        fa.runtime = "docker";
        fa.machine = localMachine?.name;
      } else if (loc === "remote") {
        fa.runtime = "system";
        // machine should already be set from old remote config
      } else {
        fa.runtime = "system";
        fa.machine = localMachine?.name;
      }
      delete (fa as any).location;
      fleetDirty = true;
    }
  }

  if (fleetDirty) {
    const fs = await import("fs");
    const fleetPath = process.env.FLEET_PATH ?? ".agency/fleet.json";
    fs.writeFileSync(fleetPath, JSON.stringify(fleet, null, 2) + "\n");
    console.log("[daemon] migrated fleet.json from location → runtime + machine");
  }

  // Also backfill machine column in DB if null
  if (localMachine) {
    const { db } = await import("./api/db/client.js");
    await db.updateTable("agents")
      .set({ machine: localMachine.name })
      .where("machine", "is", null)
      .execute();
  }
}

// Fleet sync (must happen after migrations so runtime+machine columns exist)
await apiModule.initFleetSync();

// Push skills to remote agents periodically
const { pushSkillsToAllAgents, syncSystemFilesToRoles } = await import("./api/lib/sync-skills.js");
const { provisionAgent, pushToRemote, pushToDocker } = await import("./api/lib/provision-openclaw.js");
const { collectAllMetrics } = await import("./api/lib/metrics.js");

// Reconcile running agent processes (handles daemon restarts)
const { reconcileRunningProcesses } = await import("./api/lib/processes.js");
await reconcileRunningProcesses();

// Sync system files to all roles on startup
syncSystemFilesToRoles();

// Full config + auth + skills sync for all active agents
async function syncAllAgents() {
  const { db } = await import("./api/db/client.js");
  const { readFleet } = await import("./api/lib/fleet-sync.js");
  const agents = await db.selectFrom("agents").where("status", "=", "active").selectAll().execute();
  const fleet = readFleet();

  for (const a of agents) {
    const runtime = (a as any).runtime ?? "system";
    const machineName = (a as any).machine;
    try {
      await provisionAgent(a.name, a.role, runtime);
    } catch {
      // Non-fatal — agent may still work with existing config
    }

    // Determine if machine is local
    const { readMachines } = await import("./api/routes/machines.js");
    const machines = readMachines();
    const machine = machines.find((m: any) => m.name === machineName);
    const isLocal = !machine || machine.auth === "local";

    // Push to remote/docker agents
    if (runtime === "system" && !isLocal && machineName) {
      try {
        const { getSSHConfig } = await import("./api/lib/ssh.js");
        const { host } = await getSSHConfig(machineName);
        await pushToRemote(a.name, a.role, host, machineName);
      } catch {}
    } else if (runtime === "docker") {
      try { await pushToDocker(a.name, a.role); } catch {}
    }
    // Local system agents: openclaw watches the filesystem, no push needed
  }
}

setInterval(async () => {
  try {
    syncSystemFilesToRoles();
    await pushSkillsToAllAgents();
    await syncAllAgents();
  } catch (err) {
    console.error("[daemon] sync error:", err);
  }
}, 60_000);

// Collect system metrics every 15 seconds
setInterval(async () => {
  try {
    await collectAllMetrics();
  } catch (err) {
    console.error("[daemon] metrics collection error:", err);
  }
}, 15_000);

// Collect once on startup (after a short delay to let agents register)
setTimeout(() => collectAllMetrics().catch(console.error), 3_000);

function spawnChild(name: string, cmd: string[], cwd: string) {
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  let stopped = false;

  function start() {
    console.log(`[daemon] starting ${name}...`);
    proc = Bun.spawn(cmd, {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env },
    });
    console.log(`[daemon] ${name} pid=${proc.pid}`);

    proc.exited.then((code) => {
      if (stopped) return;
      console.error(`[daemon] ${name} exited with code ${code}, restarting in 1s...`);
      setTimeout(start, 1000);
    });
  }

  start();

  return {
    kill() {
      stopped = true;
      proc?.kill();
    },
  };
}

const children: { kill(): void }[] = [];

// Dashboard is now served as static files from the API process — no child needed.

// Only spawn notify if it exists
const notifyEntry = path.resolve(import.meta.dir, "../packages/notify/src/index.ts");
if (await Bun.file(notifyEntry).exists()) {
  children.push(
    spawnChild(
      "notify",
      ["bun", "run", "src/index.ts"],
      path.resolve(import.meta.dir, "../packages/notify")
    )
  );
}

async function shutdown() {
  console.log("[daemon] shutting down...");
  const { stopAllTunnels } = await import("./api/lib/tunnels.js");
  stopAllTunnels();
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
