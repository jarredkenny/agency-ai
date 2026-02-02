import { Hono } from "hono";
import { db } from "../db/client.js";
import { resolveAgent } from "../lib/resolve-agent.js";
import {
  writeAgentToFleet,
  removeAgentFromFleet,
  readFleet,
} from "../lib/fleet-sync.js";
import { startLocal, stopLocal } from "../lib/processes.js";
import { stopTunnel } from "../lib/tunnels.js";
import { pushSkillsToAgent } from "../lib/sync-skills.js";
import { deployRemote, stopRemote } from "../lib/remote-deploy.js";
import { provisionAgent } from "../lib/provision-openclaw.js";
import { listRoles, getRoleConfig } from "../lib/fs-store.js";

const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;
const VALID_LOCATIONS = new Set(["docker", "remote", "local"]);

// Map of allowed file names to config_type values
const FILE_TO_CONFIG_TYPE: Record<string, string> = {
  "SOUL.md": "soul",
  "USER.md": "identity",
  "AGENTS.md": "agents",
  "MEMORY.md": "soul",
  "TOOLS.md": "tools",
};

export const agents = new Hono();

// List available roles (from filesystem)
agents.get("/roles", async (c) => {
  return c.json(listRoles());
});

agents.get("/", async (c) => {
  const rows = await db.selectFrom("agents").selectAll().execute();
  // Enrich with fleet data (machine, skills)
  const fleet = readFleet();
  const enriched = rows.map((r) => {
    const fa = fleet.agents[r.name];
    return {
      ...r,
      machine: fa?.machine ?? null,
      skills: fa?.skills ?? [],
    };
  });
  return c.json(enriched);
});

agents.get("/:name", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);
  const fleet = readFleet();
  const fa = fleet.agents[agent.name];
  return c.json({
    ...agent,
    machine: fa?.machine ?? null,
    skills: fa?.skills ?? [],
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
    location: string;
    machine?: string;
    slack_bot_token?: string;
    slack_app_token?: string;
  }>();

  if (!NAME_RE.test(body.name)) {
    return c.json({ error: "invalid name: must match /^[a-z][a-z0-9-]{1,30}$/" }, 400);
  }
  if (!VALID_LOCATIONS.has(body.location)) {
    return c.json({ error: "invalid location: must be docker, remote, or local" }, 400);
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
    location: body.location,
    ...(body.machine ? { machine: body.machine } : {}),
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
      location: body.location,
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
    location?: string;
    machine?: string | null;
    skills?: string[];
    slack_bot_token?: string | null;
    slack_app_token?: string | null;
  }>();

  let q = db.updateTable("agents").where("id", "=", agent.id);
  if (body.status !== undefined) q = q.set("status", body.status);
  if (body.current_task !== undefined) q = q.set("current_task", body.current_task);
  if (body.role !== undefined) q = q.set("role", body.role);
  if (body.location !== undefined) {
    if (!VALID_LOCATIONS.has(body.location)) {
      return c.json({ error: "invalid location" }, 400);
    }
    q = q.set("location", body.location);
  }
  if (body.slack_bot_token !== undefined) q = q.set("slack_bot_token", body.slack_bot_token);
  if (body.slack_app_token !== undefined) q = q.set("slack_app_token", body.slack_app_token);
  q = q.set("updated_at", new Date().toISOString());

  const updated = await q.returningAll().executeTakeFirstOrThrow();

  // Sync config fields to fleet.json
  if (body.role !== undefined || body.location !== undefined ||
      body.machine !== undefined || body.skills !== undefined ||
      body.slack_bot_token !== undefined ||
      body.slack_app_token !== undefined) {
    const fleet = readFleet();
    const existing = fleet.agents[agent.name] ?? { role: updated.role, location: updated.location ?? "local" };
    await writeAgentToFleet(agent.name, {
      ...existing,
      role: updated.role,
      location: updated.location ?? "local",
      ...(body.machine !== undefined ? { machine: body.machine ?? undefined } : {}),
      ...(body.skills !== undefined ? { skills: body.skills } : {}),
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

  // Stop docker container if running
  if (agent.location === "docker") {
    try {
      const proc = Bun.spawn(
        ["docker", "compose", "-f", "docker-compose.agents.yml", "stop", `agent-${agent.name}`],
        { cwd: process.cwd(), stdout: "inherit", stderr: "inherit" }
      );
      await proc.exited;
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

  // Provision OpenClaw config + auth before starting
  try {
    await provisionAgent(agent.name, agent.role, agent.location ?? "local");
  } catch (err: any) {
    return c.json({ error: `Provisioning failed: ${err.message}` }, 500);
  }

  if (agent.location === "local") {
    await startLocal(agent.name, agent.role);
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "active", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "deployed", method: "local" });
  }

  if (agent.location === "remote") {
    const fleet = readFleet();
    const machine = fleet.agents[agent.name]?.machine;
    try {
      await deployRemote(agent.name, agent.role, machine);
    } catch (err: any) {
      return c.json({ error: `Remote deploy failed: ${err.message}` }, 500);
    }

    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "active", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "deployed", method: "remote", tunnel: true });
  }

  if (agent.location === "docker") {
    const proc = Bun.spawn(
      ["docker", "compose", "-f", "docker-compose.agents.yml", "up", "-d", `agent-${agent.name}`],
      { cwd: process.cwd(), stdout: "inherit", stderr: "inherit" }
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return c.json({ error: "docker compose up failed" }, 500);
    }
    // Push config + auth into running container
    const { pushToDocker } = await import("../lib/provision-openclaw.js");
    await pushToDocker(agent.name, agent.role);
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "active", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "deployed", method: "docker" });
  }

  return c.json({ error: "unsupported location" }, 400);
});

// Stop agent
agents.post("/:name/stop", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  if (agent.location === "local") {
    const stopped = stopLocal(agent.name);
    if (!stopped) {
      return c.json({ error: "no local process found" }, 400);
    }
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "idle", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "stopped" });
  }

  if (agent.location === "docker") {
    const proc = Bun.spawn(
      ["docker", "compose", "-f", "docker-compose.agents.yml", "stop", `agent-${agent.name}`],
      { cwd: process.cwd(), stdout: "inherit", stderr: "inherit" }
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return c.json({ error: "docker compose stop failed" }, 500);
    }
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "idle", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "stopped" });
  }

  if (agent.location === "remote") {
    const fleet = readFleet();
    const machine = fleet.agents[agent.name]?.machine;
    await stopRemote(agent.name, machine);
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "idle", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "stopped", tunnel: "closed" });
  }

  return c.json({ error: "stop not supported for this agent location" }, 400);
});
