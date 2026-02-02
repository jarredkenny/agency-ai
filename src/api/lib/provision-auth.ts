import * as fs from "fs";
import * as path from "path";
import { db } from "../db/client.js";

const HOME = process.env.HOME ?? "";

/**
 * Provision an OpenClaw auth-profiles.json for a managed agent.
 *
 * Strategy: copy the main openclaw profile's auth file (the source of truth
 * that the user has already authenticated), then layer in any DB-configured
 * credentials. This ensures the agent gets exactly the same token format
 * that openclaw expects.
 *
 * For a profile named "sonny", the target is:
 *   ~/.openclaw-sonny/agents/main/agent/auth-profiles.json
 */
export async function provisionAuth(agentName: string): Promise<string> {
  const mainAuthPath = path.join(HOME, ".openclaw", "agents", "main", "agent", "auth-profiles.json");

  let authFile: { version: number; profiles: Record<string, unknown>; lastGood: Record<string, string>; usageStats: Record<string, unknown> };

  // Start from the main profile if it exists — it has the proven working format
  if (fs.existsSync(mainAuthPath)) {
    authFile = JSON.parse(fs.readFileSync(mainAuthPath, "utf-8"));
    // Clear usage stats for the new agent
    authFile.usageStats = {};
  } else {
    authFile = { version: 1, profiles: {}, lastGood: {}, usageStats: {} };
  }

  // Layer in DB credentials if configured (supplements/overrides main profile)
  const rows = await db
    .selectFrom("settings")
    .where("category", "=", "ai")
    .selectAll()
    .execute();

  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  const authMethod = s["ai.auth_method"] || "api_key";

  if (authMethod === "oauth" && s["ai.oauth_access_token"]) {
    authFile.profiles["anthropic:agency"] = {
      type: "token",
      provider: "anthropic",
      token: s["ai.oauth_access_token"],
    };
    // Only override lastGood if main profile doesn't already have a working one
    if (!authFile.lastGood["anthropic"]) {
      authFile.lastGood["anthropic"] = "anthropic:agency";
    }
  } else if (s["ai.anthropic_api_key"]) {
    authFile.profiles["anthropic:agency"] = {
      type: "token",
      provider: "anthropic",
      token: s["ai.anthropic_api_key"],
    };
    if (!authFile.lastGood["anthropic"]) {
      authFile.lastGood["anthropic"] = "anthropic:agency";
    }
  }

  // If we still have no profiles, fail explicitly
  if (Object.keys(authFile.profiles).length === 0) {
    throw new Error("No auth credentials available. Configure in Settings → AI or run 'openclaw configure'.");
  }

  const targetDir = path.join(HOME, `.openclaw-${agentName}`, "agents", "main", "agent");
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, "auth-profiles.json");
  fs.writeFileSync(targetPath, JSON.stringify(authFile, null, 2));

  console.log(`[provision-auth] wrote ${targetPath}`);
  return targetPath;
}

/**
 * Provision auth for an EC2 agent by writing auth-profiles.json locally
 * then rsyncing it to the remote host.
 */
export async function provisionAuthRemote(
  agentName: string,
  host: string,
): Promise<void> {
  // Build the file locally first
  const localPath = await provisionAuth(agentName);

  const { getSSHConfig } = await import("./ssh.js");
  const { keyPath, user } = await getSSHConfig();

  const remoteDir = `~/.openclaw-${agentName}/agents/main/agent/`;
  // Ensure remote directory exists
  const mkdirProc = Bun.spawn(
    [
      "ssh", "-i", keyPath, "-o", "StrictHostKeyChecking=no",
      `${user}@${host}`,
      `mkdir -p ${remoteDir}`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  await mkdirProc.exited;

  const proc = Bun.spawn(
    [
      "rsync", "-az",
      "-e", `ssh -i ${keyPath} -o StrictHostKeyChecking=no`,
      localPath,
      `${user}@${host}:${remoteDir}auth-profiles.json`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Failed to rsync auth-profiles.json to ${host}`);
  }
  console.log(`[provision-auth] synced auth to ${agentName}@${host}`);
}
