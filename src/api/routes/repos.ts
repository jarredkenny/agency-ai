import { Hono } from "hono";
import * as fs from "fs";
import * as path from "path";

interface Repo {
  name: string;
  url: string;
  branch?: string;
}

function resolveReposPath(): string {
  return process.env.REPOS_PATH ?? path.resolve(process.cwd(), ".agency", "repos.json");
}

function readRepos(): Repo[] {
  const p = resolveReposPath();
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeRepos(repos: Repo[]): void {
  const p = resolveReposPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(repos, null, 2) + "\n");
}

export const repos = new Hono();

repos.get("/", (c) => {
  return c.json(readRepos());
});

repos.post("/", async (c) => {
  const body = await c.req.json<{ name: string; url: string; branch?: string }>();
  if (!body.name || !body.url) {
    return c.json({ error: "name and url are required" }, 400);
  }

  const list = readRepos();
  if (list.find((r) => r.name === body.name)) {
    return c.json({ error: "repo already exists" }, 409);
  }

  list.push({ name: body.name, url: body.url, branch: body.branch });
  writeRepos(list);
  return c.json({ ok: true }, 201);
});

repos.delete("/:name", (c) => {
  const name = c.req.param("name");
  const list = readRepos();
  const filtered = list.filter((r) => r.name !== name);
  if (filtered.length === list.length) {
    return c.json({ error: "not found" }, 404);
  }
  writeRepos(filtered);
  return c.json({ ok: true });
});
