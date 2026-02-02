import { join } from "path";
import { existsSync } from "fs";
import { db } from "../db/client.js";
import { getSSHConfig } from "./ssh.js";
import { readFleet } from "./fleet-sync.js";

export async function pushSkillsToAgent(agent: {
  name: string;
  role: string;
  location: string;
}): Promise<void> {
  if (agent.location === "local") return;

  const skillsSource = join(process.cwd(), `roles/${agent.role}/skills/`);
  if (!existsSync(skillsSource)) return;

  if (agent.location === "remote") {
    const fleet = readFleet();
    const machine = fleet.agents[agent.name]?.machine;
    if (!machine) return;

    const { keyPath, user, host, port } = await getSSHConfig(machine);
    const proc = Bun.spawn(
      [
        "rsync",
        "-az",
        "--delete",
        "-e",
        `ssh -i ${keyPath} -p ${port} -o StrictHostKeyChecking=no`,
        skillsSource,
        `${user}@${host}:~/agency/roles/${agent.role}/skills/`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`[sync-skills] rsync to ${agent.name} failed (exit ${code})`);
    }
  }

  if (agent.location === "docker") {
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
  location: string;
}): Promise<void> {
  if (agent.location === "local") return;

  const roleSource = join(process.cwd(), `roles/${agent.role}/`);
  if (!existsSync(roleSource)) return;

  if (agent.location === "remote") {
    const fleet = readFleet();
    const machine = fleet.agents[agent.name]?.machine;
    if (!machine) return;

    const { keyPath, user, host, port } = await getSSHConfig(machine);
    const proc = Bun.spawn(
      [
        "rsync",
        "-az",
        "--delete",
        "-e",
        `ssh -i ${keyPath} -p ${port} -o StrictHostKeyChecking=no`,
        roleSource,
        `${user}@${host}:~/agency/roles/${agent.role}/`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`[sync] rsync role to ${agent.name} failed (exit ${code})`);
    }
  }

  if (agent.location === "docker") {
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
      pushRoleToAgent({ name: a.name, role: a.role, location: a.location ?? "local" }),
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
      pushSkillsToAgent({ name: a.name, role: a.role, location: a.location ?? "local" }),
    ),
  );
}
