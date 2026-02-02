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

// Push skills to remote agents periodically
const { pushSkillsToAllAgents } = await import("./api/lib/sync-skills.js");
const { provisionAgent, pushToRemote, pushToDocker } = await import("./api/lib/provision-openclaw.js");

// Full config + auth + skills sync for all active agents
async function syncAllAgents() {
  const { db } = await import("./api/db/client.js");
  const { readFleet } = await import("./api/lib/fleet-sync.js");
  const agents = await db.selectFrom("agents").where("status", "=", "active").selectAll().execute();
  const fleet = readFleet();

  for (const a of agents) {
    const location = a.location ?? "local";
    try {
      await provisionAgent(a.name, a.role, location);
    } catch {
      // Non-fatal — agent may still work with existing config
    }

    // Push to remote/docker agents
    if (location === "remote") {
      const machine = fleet.agents[a.name]?.machine;
      if (machine) {
        try {
          const { getSSHConfig } = await import("./api/lib/ssh.js");
          const { host } = await getSSHConfig(machine);
          await pushToRemote(a.name, a.role, host, machine);
        } catch {}
      }
    } else if (location === "docker") {
      try { await pushToDocker(a.name, a.role); } catch {}
    }
    // Local agents: openclaw watches the filesystem, no push needed
  }
}

setInterval(async () => {
  try {
    await pushSkillsToAllAgents();
    await syncAllAgents();
  } catch (err) {
    console.error("[daemon] sync error:", err);
  }
}, 60_000);

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
