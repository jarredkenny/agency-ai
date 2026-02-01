import * as path from "path";
import { findAgencyRoot } from "./cli/lib/find-root.js";

// Resolve .agency/ and set environment
const agencyRoot = findAgencyRoot();
if (agencyRoot) {
  process.env.DATABASE_PATH ??= path.join(agencyRoot, "agency.db");
  process.env.FLEET_PATH ??= path.join(agencyRoot, "fleet.json");
}

// Start API server (in-process via Bun's default export)
console.log("[daemon] starting API server...");
await import("./api/index.js");

// Run migrations on startup
const { runMigrations } = await import("./api/db/migrate.js");
await runMigrations();

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

// Find the dashboard directory — could be relative to package or in project
const possibleDashboardPaths = [
  path.resolve(import.meta.dir, "../dashboard"),
  path.resolve(process.cwd(), "dashboard"),
];

let dashboardDir: string | null = null;
for (const p of possibleDashboardPaths) {
  const standalonePath = path.join(p, ".next/standalone/server.js");
  const pkgPath = path.join(p, "package.json");
  if (Bun.file(standalonePath).size > 0 || Bun.file(pkgPath).size > 0) {
    dashboardDir = p;
    break;
  }
}

const children: { kill(): void }[] = [];

if (dashboardDir) {
  const standalonePath = path.join(dashboardDir, ".next/standalone/server.js");
  if (await Bun.file(standalonePath).exists()) {
    // Use standalone build
    children.push(
      spawnChild(
        "dashboard",
        ["node", standalonePath],
        dashboardDir
      )
    );
  } else {
    // Dev mode — use next start
    children.push(
      spawnChild(
        "dashboard",
        ["bun", "next", "start", "-p", "3001"],
        dashboardDir
      )
    );
  }
}

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

function shutdown() {
  console.log("[daemon] shutting down...");
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
