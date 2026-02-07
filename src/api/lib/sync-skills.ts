import { join } from "path";
import { existsSync, readdirSync, copyFileSync, mkdirSync } from "fs";
import { db } from "../db/client.js";
import { getSSHConfig } from "./ssh.js";
import { readMachines } from "../routes/machines.js";
import { listRoles } from "./fs-store.js";

export async function pushSkillsToAgent(agent: {
  name: string;
  role: string;
  runtime: string;
  machine?: string | null;
}): Promise<void> {
  const isLocal = resolveIsLocal(agent.machine);
  if (isLocal && agent.runtime === "system") return;

  const skillsSource = join(process.cwd(), `roles/${agent.role}/skills/`);
  if (!existsSync(skillsSource)) return;

  if (agent.runtime === "system" && !isLocal) {
    if (!agent.machine) return;
    const config = await getSSHConfig(agent.machine);
    const proc = Bun.spawn(
      [
        "rsync",
        "-az",
        "--delete",
        "-e",
        config.sshCmd,
        skillsSource,
        `${config.dest}:~/agency/roles/${agent.role}/skills/`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`[sync-skills] rsync to ${agent.name} failed (exit ${code})`);
    }
  }

  if (agent.runtime === "docker") {
    const proc = Bun.spawn(
      [
        "docker",
        "cp",
        `${skillsSource}.`,
        `agent-${agent.name}:/app/roles/${agent.role}/skills`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`[sync-skills] docker cp to ${agent.name} failed (exit ${code})`);
    }
  }
}

export async function pushRoleToAgent(agent: {
  name: string;
  role: string;
  runtime: string;
  machine?: string | null;
}): Promise<void> {
  const isLocal = resolveIsLocal(agent.machine);
  if (isLocal && agent.runtime === "system") return;

  const roleSource = join(process.cwd(), `roles/${agent.role}/`);
  if (!existsSync(roleSource)) return;

  if (agent.runtime === "system" && !isLocal) {
    if (!agent.machine) return;
    const config = await getSSHConfig(agent.machine);
    const proc = Bun.spawn(
      [
        "rsync",
        "-az",
        "--delete",
        "-e",
        config.sshCmd,
        roleSource,
        `${config.dest}:~/agency/roles/${agent.role}/`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`[sync] rsync role to ${agent.name} failed (exit ${code})`);
    }
  }

  if (agent.runtime === "docker") {
    const proc = Bun.spawn(
      [
        "docker",
        "cp",
        `${roleSource}.`,
        `agent-${agent.name}:/app/roles/${agent.role}`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`[sync] docker cp role to ${agent.name} failed (exit ${code})`);
    }
  }
}

export async function pushRoleToAllAgents(role: string): Promise<void> {
  const agents = await db
    .selectFrom("agents")
    .where("status", "=", "active")
    .where("role", "=", role)
    .selectAll()
    .execute();

  await Promise.allSettled(
    agents.map((a) =>
      pushRoleToAgent({ name: a.name, role: a.role, runtime: (a as any).runtime ?? "system", machine: (a as any).machine }),
    ),
  );
}

export async function pushSkillsToAllAgents(): Promise<void> {
  const agents = await db
    .selectFrom("agents")
    .where("status", "=", "active")
    .selectAll()
    .execute();

  await Promise.allSettled(
    agents.map((a) =>
      pushSkillsToAgent({ name: a.name, role: a.role, runtime: (a as any).runtime ?? "system", machine: (a as any).machine }),
    ),
  );
}

/**
 * Sync system-level files (from system/) to all role directories.
 * These are Agency-managed files that apply to all agents regardless of role.
 */
export function syncSystemFilesToRoles(): void {
  const systemDir = join(process.cwd(), "system");
  if (!existsSync(systemDir)) return;

  const roles = listRoles();
  const systemFiles = readdirSync(systemDir).filter((f) => f.endsWith(".md"));

  for (const role of roles) {
    const roleDir = join(process.cwd(), "roles", role);
    mkdirSync(roleDir, { recursive: true });

    for (const file of systemFiles) {
      const src = join(systemDir, file);
      const dest = join(roleDir, file);
      try {
        copyFileSync(src, dest);
      } catch (err) {
        console.error(`[sync-system] failed to copy ${file} to ${role}:`, err);
      }
    }
  }

  console.log(`[sync-system] synced ${systemFiles.length} system file(s) to ${roles.length} role(s)`);
}

function resolveIsLocal(machineName?: string | null): boolean {
  if (!machineName) return true;
  const machines = readMachines();
  const machine = machines.find((m) => m.name === machineName);
  return machine?.auth === "local" ?? true;
}
