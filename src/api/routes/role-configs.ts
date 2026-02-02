import { Hono } from "hono";
import {
  listRoleConfigs,
  getRoleConfig,
  putRoleConfig,
  deleteRoleConfig,
} from "../lib/fs-store.js";
import { pushRoleToAllAgents } from "../lib/sync-skills.js";

export const roleConfigs = new Hono();

// List all role configs, optional ?role=
roleConfigs.get("/", async (c) => {
  const role = c.req.query("role") || undefined;
  const rows = listRoleConfigs(role);
  return c.json(rows);
});

// Get one role config by role + config_type
roleConfigs.get("/:role/:configType", async (c) => {
  const content = getRoleConfig(c.req.param("role"), c.req.param("configType"));
  if (content === null) return c.json({ error: "not found" }, 404);
  return c.json({
    role: c.req.param("role"),
    config_type: c.req.param("configType"),
    content,
  });
});

// Upsert a role config
roleConfigs.put("/:role/:configType", async (c) => {
  const role = c.req.param("role");
  const configType = c.req.param("configType");
  const { content } = await c.req.json<{ content: string }>();

  putRoleConfig(role, configType, content);
  pushRoleToAllAgents(role).catch(() => {});
  return c.json({ role, config_type: configType, content });
});

// Delete a role config
roleConfigs.delete("/:role/:configType", async (c) => {
  deleteRoleConfig(c.req.param("role"), c.req.param("configType"));
  return c.json({ ok: true });
});
