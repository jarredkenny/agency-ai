import * as fs from "fs";
import * as path from "path";
import { db } from "../db/client.js";

function resolveFleetPath(): string {
  return process.env.FLEET_PATH ?? path.resolve(process.cwd(), ".agency", "fleet.json");
}

let writeLock = false;
let watcherTimeout: ReturnType<typeof setTimeout> | null = null;

interface FleetAgent {
  role: string;
  location?: string;
  host?: string;
  slackBotToken?: string;
  slackAppToken?: string;
}

interface Fleet {
  agents: Record<string, FleetAgent>;
  [key: string]: any;
}

export function readFleet(): Fleet {
  const fleetPath = resolveFleetPath();
  if (!fs.existsSync(fleetPath)) {
    return { agents: {} };
  }
  return JSON.parse(fs.readFileSync(fleetPath, "utf-8"));
}

function writeFleet(fleet: Fleet): void {
  const fleetPath = resolveFleetPath();
  fs.writeFileSync(fleetPath, JSON.stringify(fleet, null, 2) + "\n");
}

export async function writeAgentToFleet(
  name: string,
  config: FleetAgent
): Promise<void> {
  writeLock = true;
  try {
    const fleet = readFleet();
    fleet.agents[name] = config;
    writeFleet(fleet);
  } finally {
    writeLock = false;
  }
}

export async function removeAgentFromFleet(name: string): Promise<void> {
  writeLock = true;
  try {
    const fleet = readFleet();
    delete fleet.agents[name];
    writeFleet(fleet);
  } finally {
    writeLock = false;
  }
}

export async function reconcileDbFromFleet(): Promise<void> {
  const fleet = readFleet();
  const agents = fleet.agents ?? {};

  for (const [name, config] of Object.entries(agents)) {
    const existing = await db
      .selectFrom("agents")
      .select("id")
      .where("name", "=", name)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable("agents")
        .where("id", "=", existing.id)
        .set({
          role: config.role,
          location: config.location ?? null,
          slack_bot_token: config.slackBotToken ?? null,
          slack_app_token: config.slackAppToken ?? null,
          updated_at: new Date().toISOString(),
        })
        .execute();
    } else {
      await db
        .insertInto("agents")
        .values({
          id: crypto.randomUUID(),
          name,
          role: config.role,
          location: config.location ?? null,
          slack_bot_token: config.slackBotToken ?? null,
          slack_app_token: config.slackAppToken ?? null,
          status: "idle",
          current_task: null,
          session_key: `agent:${name}:main`,
        })
        .execute();
    }
  }

  // Ensure "human" agent exists for dashboard task creation
  const humanExists = await db
    .selectFrom("agents")
    .select("id")
    .where("name", "=", "human")
    .executeTakeFirst();

  if (!humanExists) {
    await db
      .insertInto("agents")
      .values({
        id: crypto.randomUUID(),
        name: "human",
        role: "human",
        status: "active",
        current_task: null,
        session_key: "agent:human:main",
      })
      .execute();
    console.log("[fleet-sync] created human agent");
  }

  console.log(`[fleet-sync] reconciled ${Object.keys(agents).length} agent(s)`);
}

export async function regenerateCompose(): Promise<void> {
  // No-op for now — docker compose generation moved to CLI
}

export function startWatcher(): void {
  const fleetPath = resolveFleetPath();
  if (!fs.existsSync(fleetPath)) {
    console.log("[fleet-sync] no fleet.json found, skipping watcher");
    return;
  }
  try {
    fs.watch(fleetPath, () => {
      if (writeLock) return;
      if (watcherTimeout) clearTimeout(watcherTimeout);
      watcherTimeout = setTimeout(async () => {
        console.log("[fleet-sync] fleet.json changed externally, reconciling...");
        try {
          await reconcileDbFromFleet();
        } catch (err) {
          console.error("[fleet-sync] reconcile error:", err);
        }
      }, 500);
    });
    console.log("[fleet-sync] watching fleet.json for changes");
  } catch (err) {
    console.error("[fleet-sync] could not watch fleet.json:", err);
  }
}
