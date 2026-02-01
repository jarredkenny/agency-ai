import { api } from "../lib/api.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export default async function ssh(args: string[]) {
  const name = args[0];
  if (!name) {
    console.error("Usage: agency ssh <agent-name>");
    process.exit(1);
  }

  const agent = await api(`/agents/${name}`);
  if (!agent) {
    console.error(`Agent "${name}" not found.`);
    process.exit(1);
  }

  if (agent.location !== "ec2") {
    console.error(`SSH is only supported for EC2 agents. "${name}" is ${agent.location ?? "local"}.`);
    process.exit(1);
  }

  // Get SSH settings
  const settings = await api("/settings?category=ssh");
  const sshConfig: Record<string, string> = {};
  for (const s of settings) {
    sshConfig[s.key] = s.value;
  }

  const privateKey = sshConfig["ssh.private_key"];
  const user = sshConfig["ssh.user"] || "ubuntu";

  if (!privateKey) {
    console.error("SSH private key not configured. Set it in Settings → SSH.");
    process.exit(1);
  }

  // Get host from fleet.json via agent detail or settings
  // The agent's host should be in fleet.json
  const configRes = await api("/settings?category=aws");
  // We need the fleet host — fetch it from the API or read fleet.json directly
  let host = "";
  try {
    const fleetPath = path.resolve(process.cwd(), ".agency", "fleet.json");
    const fleet = JSON.parse(fs.readFileSync(fleetPath, "utf-8"));
    host = fleet.agents?.[name]?.host ?? "";
  } catch {}

  if (!host) {
    console.error(`No host configured for "${name}". Add "host" to fleet.json for this agent.`);
    process.exit(1);
  }

  // Write key to temp file
  const keyDir = path.join(os.tmpdir(), "agency-ssh");
  fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(keyDir, "agent_key");
  fs.writeFileSync(keyPath, privateKey + "\n", { mode: 0o600 });

  // Exec ssh
  const proc = Bun.spawn(
    ["ssh", "-i", keyPath, "-o", "StrictHostKeyChecking=no", `${user}@${host}`, ...args.slice(1)],
    { stdout: "inherit", stderr: "inherit", stdin: "inherit" }
  );
  const code = await proc.exited;
  process.exit(code);
}
