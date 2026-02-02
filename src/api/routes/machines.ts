import { Hono } from "hono";
import * as fs from "fs";
import * as path from "path";

export interface Machine {
  name: string;
  host: string;
  user: string;
  port: number;
  auth: "key" | "password";
  ssh_key?: string;
  password?: string;
}

function resolveMachinesPath(): string {
  return process.env.MACHINES_PATH ?? path.resolve(process.cwd(), ".agency", "machines.json");
}

export function readMachines(): Machine[] {
  const p = resolveMachinesPath();
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeMachines(machines: Machine[]): void {
  const p = resolveMachinesPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(machines, null, 2) + "\n");
}

function mask(m: Machine): Record<string, unknown> {
  return {
    name: m.name,
    host: m.host,
    user: m.user,
    port: m.port,
    auth: m.auth,
    ssh_key: m.ssh_key ? "********" : undefined,
    password: m.password ? "********" : undefined,
  };
}

export const machines = new Hono();

machines.get("/", (c) => {
  return c.json(readMachines().map(mask));
});

machines.post("/", async (c) => {
  const body = await c.req.json<Machine>();
  if (!body.name || !body.host || !body.user) {
    return c.json({ error: "name, host, and user are required" }, 400);
  }

  const list = readMachines();
  if (list.find((m) => m.name === body.name)) {
    return c.json({ error: "machine already exists" }, 409);
  }

  list.push({
    name: body.name,
    host: body.host,
    user: body.user,
    port: body.port || 22,
    auth: body.auth || "key",
    ssh_key: body.ssh_key,
    password: body.password,
  });
  writeMachines(list);
  return c.json(mask(list[list.length - 1]), 201);
});

machines.put("/:name", async (c) => {
  const name = c.req.param("name");
  const list = readMachines();
  const idx = list.findIndex((m) => m.name === name);
  if (idx === -1) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<Partial<Machine>>();
  const existing = list[idx];
  list[idx] = {
    name: existing.name,
    host: body.host ?? existing.host,
    user: body.user ?? existing.user,
    port: body.port ?? existing.port,
    auth: body.auth ?? existing.auth,
    ssh_key: body.ssh_key !== undefined ? body.ssh_key : existing.ssh_key,
    password: body.password !== undefined ? body.password : existing.password,
  };
  writeMachines(list);
  return c.json(mask(list[idx]));
});

machines.delete("/:name", (c) => {
  const name = c.req.param("name");
  const list = readMachines();
  const filtered = list.filter((m) => m.name !== name);
  if (filtered.length === list.length) {
    return c.json({ error: "not found" }, 404);
  }
  writeMachines(filtered);
  return c.json({ ok: true });
});
