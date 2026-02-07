import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import * as path from "path";
import { reconcileDbFromFleet, startWatcher } from "./lib/fleet-sync.js";
import { agents } from "./routes/agents.js";
import { tasks } from "./routes/tasks.js";
import { messages } from "./routes/messages.js";
import { notifications } from "./routes/notifications.js";
import { activities } from "./routes/activities.js";
import { documents } from "./routes/documents.js";
import { knowledge } from "./routes/knowledge.js";
import { settings } from "./routes/settings.js";
import { oauth } from "./routes/oauth.js";
import { skills } from "./routes/skills.js";
import { roleConfigs } from "./routes/role-configs.js";
import { repos } from "./routes/repos.js";
import { machines } from "./routes/machines.js";

const app = new Hono();

// CORS — dashboard on :3001 hits API on :3100
app.use("*", cors());

// Global error handler — return 400/500 JSON instead of crashing
app.onError((err, c) => {
  const msg = err.message ?? "internal error";
  const errMsg = String((err as any).message ?? "");
  if (errMsg.includes("UNIQUE constraint") || errMsg.includes("FOREIGN KEY constraint") || errMsg.includes("NOT NULL constraint") || errMsg.includes("CHECK constraint")) {
    return c.json({ error: msg }, 400);
  }
  console.error(err);
  return c.json({ error: msg }, 500);
});

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/agents", agents);
app.route("/tasks", tasks);
app.route("/tasks", messages);
app.route("/notifications", notifications);
app.route("/activities", activities);
app.route("/documents", documents);
app.route("/knowledge", knowledge);
app.route("/settings", settings);
app.route("/oauth", oauth);
app.route("/skills", skills);
app.route("/role-configs", roleConfigs);
app.route("/repos", repos);
app.route("/machines", machines);

// Serve the dashboard static export
const dashboardPaths = [
  path.resolve(import.meta.dir, "../../dashboard/out"),
  path.resolve(process.cwd(), "dashboard/out"),
];
const dashboardDir = dashboardPaths.find((p) => {
  try { return Bun.file(path.join(p, "index.html")).size > 0; } catch { return false; }
});

if (dashboardDir) {
  app.use("/assets/*", serveStatic({ root: dashboardDir }));
  app.use("/_next/*", serveStatic({ root: dashboardDir }));
  app.get("/", serveStatic({ root: dashboardDir, path: "/index.html" }));
  // Fallback: serve index.html for any non-API route (SPA routing)
  app.use("*", serveStatic({ root: dashboardDir, rewriteRequestPath: () => "/index.html" }));
}

/**
 * Initialize fleet sync — call AFTER migrations have run.
 */
export async function initFleetSync() {
  await reconcileDbFromFleet();
  startWatcher();
}

export default {
  port: Number(process.env.PORT ?? 3100),
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
