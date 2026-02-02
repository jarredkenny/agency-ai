import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { db } from "../db/client.js";

export async function getSSHConfig(): Promise<{ keyPath: string; user: string }> {
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

  const keyDir = path.join(os.tmpdir(), "agency-ssh");
  fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(keyDir, "agent_key");
  fs.writeFileSync(keyPath, privateKey + "\n", { mode: 0o600 });

  return { keyPath, user };
}

export async function sshExec(
  host: string,
  command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { keyPath, user } = await getSSHConfig();

  const proc = Bun.spawn(
    [
      "ssh",
      "-i", keyPath,
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      `${user}@${host}`,
      command,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}
