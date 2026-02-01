import type { Subprocess } from "bun";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { db } from "../db/client.js";

const tunnels = new Map<string, Subprocess>();

const API_PORT = Number(process.env.PORT ?? 3100);

async function getSSHConfig(): Promise<{ keyPath: string; user: string }> {
  const rows = await db
    .selectFrom("settings")
    .where("category", "=", "ssh")
    .selectAll()
    .execute();

  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;

  const user = settings["ssh.user"] || "ubuntu";
  const privateKey = settings["ssh.private_key"] || "";

  if (!privateKey) {
    throw new Error("SSH private key not configured. Set it in Settings → SSH.");
  }

  // Write key to a temp file (SSH requires a file path)
  const keyDir = path.join(os.tmpdir(), "agency-ssh");
  fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(keyDir, "agent_key");
  fs.writeFileSync(keyPath, privateKey + "\n", { mode: 0o600 });

  return { keyPath, user };
}

export async function startTunnel(name: string, host: string): Promise<void> {
  // Kill existing tunnel if any
  stopTunnel(name);

  const { keyPath, user } = await getSSHConfig();

  const args = [
    "ssh",
    "-i", keyPath,
    "-o", "StrictHostKeyChecking=no",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    "-o", "ExitOnForwardFailure=yes",
    "-N",               // no command, just tunnel
    "-R", `${API_PORT}:localhost:${API_PORT}`,  // reverse tunnel: remote:3100 -> local:3100
    `${user}@${host}`,
  ];

  console.log(`[tunnel] opening reverse tunnel to ${name} (${user}@${host})`);

  const proc = Bun.spawn(args, {
    stdout: "inherit",
    stderr: "inherit",
  });

  tunnels.set(name, proc);

  // Auto-restart on disconnect
  proc.exited.then((code) => {
    if (tunnels.get(name) !== proc) return; // already replaced
    tunnels.delete(name);
    console.log(`[tunnel] ${name} exited with code ${code}, reconnecting in 5s...`);
    setTimeout(() => {
      // Only restart if no new tunnel was created
      if (!tunnels.has(name)) {
        startTunnel(name, host).catch((err) =>
          console.error(`[tunnel] failed to restart tunnel for ${name}:`, err.message)
        );
      }
    }, 5000);
  });
}

export function stopTunnel(name: string): boolean {
  const proc = tunnels.get(name);
  if (!proc) return false;
  proc.kill();
  tunnels.delete(name);
  console.log(`[tunnel] closed tunnel to ${name}`);
  return true;
}

export function isTunnelRunning(name: string): boolean {
  return tunnels.has(name);
}

export function stopAllTunnels(): void {
  for (const [name, proc] of tunnels) {
    proc.kill();
    console.log(`[tunnel] closed tunnel to ${name}`);
  }
  tunnels.clear();
}
