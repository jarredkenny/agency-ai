import { Hono } from "hono";
import { db } from "../db/client.js";
import { resolveAgent } from "../lib/resolve-agent.js";
import {
  writeAgentToFleet,
  removeAgentFromFleet,
} from "../lib/fleet-sync.js";
import { startLocal, stopLocal } from "../lib/processes.js";
import { stopTunnel } from "../lib/tunnels.js";
import { readFleet } from "../lib/fleet-sync.js";
import { syncSkills, pushSkillsToAgent } from "../lib/sync-skills.js";
import { deployEC2, stopEC2 } from "../lib/ec2-deploy.js";
import { provisionAuth } from "../lib/provision-auth.js";

const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;
const VALID_LOCATIONS = new Set(["docker", "ec2", "local"]);

// Map of allowed file names to role_config config_type values
const FILE_TO_CONFIG_TYPE: Record<string, string> = {
  "SOUL.md": "soul",
  "USER.md": "identity",
  "AGENTS.md": "agents",
  "MEMORY.md": "soul", // memory is part of soul for now
  "TOOLS.md": "tools",
};

export const agents = new Hono();

// List available roles (from DB role_configs)
agents.get("/roles", async (c) => {
  const rows = await db
    .selectFrom("role_configs")
    .select("role")
    .distinct()
    .execute();
  return c.json(rows.map((r) => r.role));
});

agents.get("/", async (c) => {
  const rows = await db.selectFrom("agents").selectAll().execute();
  return c.json(rows);
});

agents.get("/:name", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);
  return c.json(agent);
});

// Get agent config file from DB
agents.get("/:name/files/:filename", async (c) => {
  const filename = c.req.param("filename");
  const configType = FILE_TO_CONFIG_TYPE[filename];
  if (!configType) {
    return c.json({ error: "invalid filename" }, 400);
  }
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  const config = await db
    .selectFrom("role_configs")
    .where("role", "=", agent.role)
    .where("config_type", "=", configType)
    .selectAll()
    .executeTakeFirst();

  if (!config) {
    return c.json({ error: "file not found" }, 404);
  }
  return c.json({ filename, content: config.content });
});

// Get agent's role config by config_type directly
agents.get("/:name/config/:configType", async (c) => {
  const agent = await resolveAgent(c.req.param("name"));
  if (!agent) return c.json({ error: "not found" }, 404);

  const config = await db
    .selectFrom("role_configs")
    .where("role", "=", agent.role)
    .where("config_type", "=", c.req.param("configType"))
    .selectAll()
    .executeTakeFirst();

  if (!config) return c.json({ error: "not found" }, 404);
  return c.json(config);
});

// Create agent
agents.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    role: string;
    location: string;
    slack_bot_token?: string;
    slack_app_token?: string;
  }>();

  if (!NAME_RE.test(body.name)) {
    return c.json({ error: "invalid name: must match /^[a-z][a-z0-9-]{1,30}$/" }, 400);
  }
  if (!VALID_LOCATIONS.has(body.location)) {
    return c.json({ error: "invalid location: must be docker, ec2, or local" }, 400);
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
      body.slack_bot_token !== undefined ||
      body.slack_app_token !== undefined) {
    await writeAgentToFleet(agent.name, {
      role: updated.role,
      location: updated.location ?? "local",
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

  await syncSkills();

  // Provision OpenClaw auth credentials before starting
  try {
    await provisionAuth(agent.name);
  } catch (err: any) {
    return c.json({ error: `Auth provisioning failed: ${err.message}` }, 500);
  }

  if (agent.location === "local") {
    startLocal(agent.name, agent.role);
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "active", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "deployed", method: "local" });
  }

  if (agent.location === "ec2") {
    try {
      await deployEC2(agent.name, agent.role);
    } catch (err: any) {
      return c.json({ error: `EC2 deploy failed: ${err.message}` }, 500);
    }

    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "active", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "deployed", method: "ec2", tunnel: true });
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
    // Copy auth credentials into running container
    const authSrc = `${process.env.HOME}/.openclaw-${agent.name}/agents/main/agent/auth-profiles.json`;
    const cpProc = Bun.spawn(
      ["docker", "cp", authSrc, `agent-${agent.name}:/root/.openclaw/agents/main/agent/auth-profiles.json`],
      { cwd: process.cwd(), stdout: "inherit", stderr: "inherit" },
    );
    await cpProc.exited; // best-effort, don't fail deploy if cp fails
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

  if (agent.location === "ec2") {
    await stopEC2(agent.name);
    await db
      .updateTable("agents")
      .where("id", "=", agent.id)
      .set({ status: "idle", updated_at: new Date().toISOString() })
      .execute();
    return c.json({ status: "stopped", tunnel: "closed" });
  }

  return c.json({ error: "stop not supported for this agent location" }, 400);
});
