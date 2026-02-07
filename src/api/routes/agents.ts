import * as fs from "fs";
import * as path from "path";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { resolveAgent } from "../lib/resolve-agent.js";
import {
  writeAgentToFleet,
  removeAgentFromFleet,
  readFleet,
} from "../lib/fleet-sync.js";
import { listRoles, getRoleConfig } from "../lib/fs-store.js";
import { getMetrics } from "../lib/metrics.js";

const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;
const VALID_RUNTIMES = new Set(["system", "docker"]);

// Map of allowed file names to config_type values
const FILE_TO_CONFIG_TYPE: Record<string, string> = {
  "SOUL.md": "soul",
  "USER.md": "identity",
  "AGENTS.md": "agents",
  "MEMORY.md": "soul",
  "TOOLS.md": "tools",
};

/**
 * Write a docker-compose.agents.yml with a service for the given agent.
 * Merges into any existing services so multiple agents can coexist.
 */
export function generateAgentCompose(agentName: string): void {
  const composePath = path.join(process.cwd(), "docker-compose.agents.yml");
  const serviceName = `agent-${agentName}`;

  // Parse existing compose file to preserve other agent services
  let existing: { services: Record<string, Record<string, unknown>> } = { services: {} };
  if (fs.existsSync(composePath)) {
    try {
      const raw = fs.readFileSync(composePath, "utf-8");
      // Parse our simple YAML format: extract service blocks
      let currentService = "";
      let currentVolumes = false;
      for (const line of raw.split("\n")) {
        const svcMatch = line.match(/^  (agent-[\w-]+):$/);
        if (svcMatch) {
          currentService = svcMatch[1];
          existing.services[currentService] = {};
          currentVolumes = false;
          continue;
        }
        if (currentService) {
          const kvMatch = line.match(/^    (\w+): (.+)$/);
          if (kvMatch) {
            existing.services[currentService][kvMatch[1]] = kvMatch[2];
            currentVolumes = false;
            continue;
          }
          if (line.match(/^    volumes:$/)) {
            currentVolumes = true;
            existing.services[currentService].volumes = [];
            continue;
          }
          if (currentVolumes) {
            const volMatch = line.match(/^      - (.+)$/);
            if (volMatch) {
              (existing.services[currentService].volumes as string[]).push(volMatch[1]);
            }
          }
        }
      }
    } catch {}
  }

  const service = {
    image: "agency-agent",
    container_name: serviceName,
    restart: "unless-stopped",
    extra_hosts: ["host.docker.internal:host-gateway"],
    volumes: [`/root/.openclaw-${agentName}:/root/.openclaw-${agentName}`],
  };

  existing.services[serviceName] = service;

  // Write as YAML manually (simple enough structure)
  let yaml = "services:\n";
  for (const [name, svc] of Object.entries(existing.services)) {
    const s = svc as Record<string, unknown>;
    yaml += `  ${name}:\n`;
    yaml += `    image: ${s.image}\n`;
    yaml += `    container_name: ${s.container_name}\n`;
    yaml += `    restart: ${s.restart}\n`;
    if (Array.isArray(s.extra_hosts) && s.extra_hosts.length > 0) {
      yaml += `    extra_hosts:\n`;
      for (const h of s.extra_hosts) {
        yaml += `      - ${h}\n`;
      }
    }
    if (Array.isArray(s.volumes) && s.volumes.length > 0) {
      yaml += `    volumes:\n`;
      for (const v of s.volumes) {
        yaml += `      - ${v}\n`;
      }
    }
  }

  fs.writeFileSync(composePath, yaml);
}

export const agents = new Hono();

// List available roles (from filesystem)
agents.get("/roles", async (c) => {
  return c.json(listRoles());
});

agents.get("/", async (c) => {
  const rows = await db.selectFrom("agents").selectAll().execute();

  const enriched = rows.map((r) => ({
    ...r,
    metrics: getMetrics(r.name),
  }));
  return c.json(enriched);
});

agents.get("/:name", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  return c.json({
    ...agent,
    metrics: getMetrics(agent.name),
  });
});

// Get agent config file from filesystem
agents.get("/:name/files/:filename", async (c) => {
  const filename = c.req.param("filename");
  const configType = FILE_TO_CONFIG_TYPE[filename];
  if (!configType) {
    return c.json({ error: "invalid filename" }, 400);
  }
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  const content = getRoleConfig(agent.role, configType);
  if (content === null) {
    return c.json({ error: "file not found" }, 404);
  }
  return c.json({ filename, content });
});

// Get agent's role config by config_type directly
agents.get("/:name/config/:configType", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  const configType = c.req.param("configType");
  const content = getRoleConfig(agent.role, configType);
  if (content === null) return c.json({ error: "not found" }, 404);
  return c.json({ role: agent.role, config_type: configType, content });
});

// Create agent
agents.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    role: string;
    runtime: string;      // "system" | "docker"
    machine: string;      // required machine name
    slack_bot_token?: string;
    slack_app_token?: string;
  }>();

  if (!NAME_RE.test(body.name)) {
    return c.json({ error: "invalid name: must match /^[a-z][a-z0-9-]{1,30}$/" }, 400);
  }
  if (!VALID_RUNTIMES.has(body.runtime)) {
    return c.json({ error: "invalid runtime: must be system or docker" }, 400);
  }
  if (!body.machine) {
    return c.json({ error: "machine is required" }, 400);
  }
  // Validate machine exists
  const { readMachines } = await import("../routes/machines.js");
  if (!readMachines().find((m: any) => m.name === body.machine)) {
    return c.json({ error: `machine "${body.machine}" not found` }, 400);
  }

  const existing = await db
    .selectFrom("agents")
    .select("id")
    .where("name", "=", body.name)
    .executeTakeFirst();
  if (existing) {
    return c.json({ error: "agent already exists" }, 409);
  }

  // Write to fleet.json
  await writeAgentToFleet(body.name, {
    role: body.role,
    runtime: body.runtime,
    machine: body.machine,
    ...(body.slack_bot_token ? { slackBotToken: body.slack_bot_token } : {}),
    ...(body.slack_app_token ? { slackAppToken: body.slack_app_token } : {}),
  });

  // Insert into DB
  const agent = await db
    .insertInto("agents")
    .values({
      id: crypto.randomUUID(),
      name: body.name,
      role: body.role,
      runtime: body.runtime,
      machine: body.machine,
      slack_bot_token: body.slack_bot_token ?? null,
      slack_app_token: body.slack_app_token ?? null,
      status: "idle",
      current_task: null,
      session_key: `agent:${body.name}:main`,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(agent, 201);
});

// Update agent
agents.patch("/:name", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{
    status?: string;
    current_task?: string | null;
    role?: string;
    runtime?: string;
    machine?: string | null;
    slack_bot_token?: string | null;
    slack_app_token?: string | null;
  }>();

  let q = db.updateTable("agents").where("id", "=", agent.id);
  if (body.status !== undefined) q = q.set("status", body.status);
  if (body.current_task !== undefined) q = q.set("current_task", body.current_task);
  if (body.role !== undefined) q = q.set("role", body.role);
  if (body.runtime !== undefined) {
    if (!VALID_RUNTIMES.has(body.runtime)) {
      return c.json({ error: "invalid runtime" }, 400);
    }
    q = q.set("runtime", body.runtime);
  }
  if (body.machine !== undefined) {
    q = q.set("machine", body.machine);
  }
  if (body.slack_bot_token !== undefined) q = q.set("slack_bot_token", body.slack_bot_token);
  if (body.slack_app_token !== undefined) q = q.set("slack_app_token", body.slack_app_token);
  q = q.set("updated_at", new Date().toISOString());

  const updated = await q.returningAll().executeTakeFirstOrThrow();

  // Sync config fields to fleet.json
  if (body.role !== undefined || body.runtime !== undefined ||
      body.machine !== undefined ||
      body.slack_bot_token !== undefined ||
      body.slack_app_token !== undefined) {
    const fleet = readFleet();
    const existing = fleet.agents[agent.name] ?? { role: updated.role, runtime: updated.runtime ?? "system" };
    await writeAgentToFleet(agent.name, {
      ...existing,
      role: updated.role,
      runtime: updated.runtime ?? "system",
      machine: body.machine !== undefined ? (body.machine ?? undefined) : (existing.machine ?? undefined),
      ...(updated.slack_bot_token ? { slackBotToken: updated.slack_bot_token } : {}),
      ...(updated.slack_app_token ? { slackAppToken: updated.slack_app_token } : {}),
    });
  }

  return c.json(updated);
});

// Delete agent
agents.delete("/:name", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  // Stop agent if running
  if (agent.status === "active") {
    try {
      const { stop } = await import("../lib/deploy.js");
      await stop({
        name: agent.name,
        role: agent.role,
        runtime: agent.runtime ?? "system",
        machine: agent.machine ?? "",
      });
    } catch {}
  }

  await db.deleteFrom("agents").where("id", "=", agent.id).execute();
  await removeAgentFromFleet(agent.name);

  return c.json({ ok: true });
});

// Deploy agent
agents.post("/:name/deploy", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  try {
    const { deploy } = await import("../lib/deploy.js");
    const result = await deploy({
      name: agent.name,
      role: agent.role,
      runtime: agent.runtime ?? "system",
      machine: agent.machine ?? "",
      slack_bot_token: agent.slack_bot_token,
      slack_app_token: agent.slack_app_token,
    });
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "active", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "deployed", method: result.method });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Stop agent
agents.post("/:name/stop", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  try {
    const { stop } = await import("../lib/deploy.js");
    await stop({
      name: agent.name,
      role: agent.role,
      runtime: agent.runtime ?? "system",
      machine: agent.machine ?? "",
    });
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "idle", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "stopped" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
