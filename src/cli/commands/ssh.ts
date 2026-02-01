import { api } from "../lib/api.js";
import { requireAgencyRoot } from "../lib/find-root.js";
import * as path from "path";
import * as fs from "fs";

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

  // Get SSH settings from API
  const settings = await api("/settings?category=ssh");
  const sshConfig: Record<string, string> = {};
  for (const s of settings) {
    sshConfig[s.key] = s.value;
  }

  const keyPath = sshConfig["ssh.key_path"];
  const user = sshConfig["ssh.user"] || "ubuntu";

  if (!keyPath) {
    console.error("SSH key path not configured. Run: agency config ssh.key_path /path/to/key");
    process.exit(1);
  }

  // The agent's IP/hostname would need to be stored somewhere — for now use agent name as host
  console.error("EC2 SSH not yet fully implemented — agent IP discovery needed.");
  process.exit(1);
}
