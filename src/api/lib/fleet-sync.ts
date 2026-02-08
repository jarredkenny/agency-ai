import * as fs from "fs";
import * as path from "path";
import { db } from "../db/client.js";

const HOME = process.env.HOME ?? "";

function resolveFleetPath(): string {
  return process.env.FLEET_PATH ?? path.resolve(process.cwd(), ".agency", "fleet.json");
}

/**
 * Read Slack tokens from main OpenClaw config (~/.openclaw/openclaw.json)
 */
function getSlackTokensFromOpenClaw(): { botToken?: string; appToken?: string } {
  const configPath = path.join(HOME, ".openclaw", "openclaw.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const slack = config.channels?.slack;
    if (!slack) return {};
    return {
      botToken: slack.botToken,
      appToken: slack.appToken,
    };
  } catch {
    return {};
  }
}

let writeLock = false;
let watcherTimeout: ReturnType<typeof setTimeout> | null = null;

interface FleetAgent {
  role: string;
  runtime?: string;       // "system" | "docker" — replaces location
  machine?: string;       // machine name from machines.json
  location?: string;      // DEPRECATED — kept for migration compat
  host?: string;
  skills?: string[];
  slackBotToken?: string;
  slackAppToken?: string;
}

interface Fleet {
  agents: Record<string, FleetAgent>;
  slack?: { channel?: string; dmAllowFrom?: string[] };
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

  // Get Slack tokens from main OpenClaw config as fallback
  const openclawSlack = getSlackTokensFromOpenClaw();

  for (const [name, config] of Object.entries(agents)) {
    // Use agent-specific tokens if set, otherwise fall back to OpenClaw config
    const slackBotToken = config.slackBotToken ?? openclawSlack.botToken ?? null;
    const slackAppToken = config.slackAppToken ?? openclawSlack.appToken ?? null;

    const existing = await db
      .selectFrom("agents")
      .select("id")
      .where("name", "=", name)
      .executeTakeFirst();

    if (existing) {
      const updates: Record<string, any> = {
        role: config.role,
        location: config.location ?? null,
        runtime: config.runtime ?? (config.location === "docker" ? "docker" : "system"),
        slack_bot_token: slackBotToken,
        slack_app_token: slackAppToken,
        updated_at: new Date().toISOString(),
      };
      // Only overwrite machine if fleet.json explicitly sets it
      if (config.machine !== undefined) {
        updates.machine = config.machine;
      }
      await db
        .updateTable("agents")
        .where("id", "=", existing.id)
        .set(updates)
        .execute();
    } else {
      await db
        .insertInto("agents")
        .values({
          id: crypto.randomUUID(),
          name,
          role: config.role,
          location: config.location ?? null,
          runtime: config.runtime ?? (config.location === "docker" ? "docker" : "system"),
          machine: config.machine ?? null,
          slack_bot_token: slackBotToken,
          slack_app_token: slackAppToken,
          status: "idle",
          current_task: null,
          session_key: `agent:${name}:main`,
        })
        .execute();
    }
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
