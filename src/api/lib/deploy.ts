import * as path from "path";
import type { Machine } from "../routes/machines.js";
import { readMachines } from "../routes/machines.js";
import { exec } from "./exec.js";
import {
  provisionAgent,
  pushToDocker,
  pushToRemote,
} from "./provision-openclaw.js";
import { startLocal, stopLocal } from "./processes.js";
import { startTunnel, stopTunnel } from "./tunnels.js";
import { getEnvVars } from "./env-vars.js";
import { generateAgentCompose } from "../routes/agents.js";
import { getSSHConfig } from "./ssh.js";

interface DeployAgent {
  name: string;
  role: string;
  runtime: string;
  machine: string;
  slack_bot_token?: string | null;
  slack_app_token?: string | null;
}

/**
 * Resolve a machine by name from machines.json.
 */
export function resolveMachine(machineName: string): Machine {
  const machines = readMachines();
  const machine = machines.find((m) => m.name === machineName);
  if (!machine)
    throw new Error(`Machine "${machineName}" not found in machines.json`);
  return machine;
}

/**
 * Find the local machine (auth === "local") if one exists.
 */
export function getLocalMachine(): Machine | undefined {
  return readMachines().find((m) => m.auth === "local");
}

/**
 * Unified deploy: runtime (system|docker) x machine (local|remote) = 2x2 dispatch.
 */
export async function deploy(
  agent: DeployAgent,
): Promise<{ method: string }> {
  // Determine the target machine
  let machine: Machine;
  if (agent.machine) {
    machine = resolveMachine(agent.machine);
  } else {
    const local = getLocalMachine();
    if (!local)
      throw new Error(
        "No machine specified and no local machine found in machines.json",
      );
    machine = local;
  }

  const isLocal = machine.auth === "local";
  const runtime = agent.runtime || "system";

  // Provision config + auth locally first
  const slackTokens =
    agent.slack_bot_token || agent.slack_app_token
      ? {
          botToken: agent.slack_bot_token ?? undefined,
          appToken: agent.slack_app_token ?? undefined,
        }
      : undefined;
  const location =
    runtime === "docker" ? "docker" : isLocal ? "local" : "remote";
  await provisionAgent(agent.name, agent.role, location, slackTokens);

  if (runtime === "docker") {
    await deployDocker(agent, machine, isLocal);
    return { method: isLocal ? "docker" : "docker-remote" };
  }

  // runtime === "system"
  await deploySystem(agent, machine, isLocal);
  return { method: isLocal ? "local" : "remote" };
}

/**
 * Deploy as a system process (openclaw running natively).
 * Local: use startLocal() which handles provisioning, spawning, and tracking.
 * Remote: push config via rsync, then start via SSH.
 */
async function deploySystem(
  agent: DeployAgent,
  machine: Machine,
  isLocal: boolean,
): Promise<void> {
  if (isLocal) {
    await startLocal(agent.name, agent.role);
    return;
  }

  // Remote system deploy
  const config = await getSSHConfig(machine.name);

  // Push config + role workspace to remote
  await pushToRemote(agent.name, agent.role, config.host, machine.name);

  // Build env export commands and start openclaw on remote
  const envVars = await getEnvVars();
  const shellEscape = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
  const exportCmds = [
    `export AGENCY_AGENT_NAME=${shellEscape(agent.name)}`,
    ...Object.entries(envVars).map(
      ([k, v]) => `export ${k}=${shellEscape(v)}`,
    ),
  ];
  const startCmd = [
    ...exportCmds,
    `nohup openclaw --profile ${agent.name} gateway run --port 18789 > /tmp/agent-${agent.name}.log 2>&1 &`,
    `echo $!`,
  ].join(" && ");

  const result = await exec(machine, ["bash", "-c", startCmd]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to start agent process on ${machine.name}`);
  }
  console.log(
    `[deploy] started system agent ${agent.name} on ${machine.name}, pid=${result.stdout.trim()}`,
  );

  // Open reverse tunnel so remote agent can reach the API
  await startTunnel(agent.name, machine.host, machine.name);
}

/**
 * Deploy as a Docker container.
 * Handles image building, compose generation, config push, env injection,
 * and openclaw startup inside the container.
 */
async function deployDocker(
  agent: DeployAgent,
  machine: Machine,
  isLocal: boolean,
): Promise<void> {
  const serviceName = `agent-${agent.name}`;

  // 1. Check if docker image exists on target machine
  const inspect = await exec(machine, [
    "docker",
    "image",
    "inspect",
    "agency-agent",
  ]);
  if (inspect.exitCode !== 0) {
    // Image doesn't exist — build it
    if (isLocal) {
      const dockerfilePath = path.join(process.cwd(), "docker");
      const build = await exec(machine, [
        "docker",
        "build",
        "-t",
        "agency-agent",
        "-f",
        path.join(dockerfilePath, "Dockerfile.agent"),
        dockerfilePath,
      ]);
      if (build.exitCode !== 0) {
        throw new Error("docker build failed");
      }
    } else {
      // Build locally then transfer to remote
      const dockerfilePath = path.join(process.cwd(), "docker");
      const localMachine: Machine = {
        name: "local-build",
        host: "localhost",
        user: "",
        port: 0,
        auth: "local",
      };
      const build = await exec(localMachine, [
        "docker",
        "build",
        "-t",
        "agency-agent",
        "-f",
        path.join(dockerfilePath, "Dockerfile.agent"),
        dockerfilePath,
      ]);
      if (build.exitCode !== 0) {
        throw new Error("docker build failed (local)");
      }

      // Save, transfer, and load on remote
      const tmpTar = `/tmp/agency-agent-${Date.now()}.tar`;
      const save = await exec(localMachine, [
        "docker",
        "save",
        "-o",
        tmpTar,
        "agency-agent",
      ]);
      if (save.exitCode !== 0) {
        throw new Error("docker save failed");
      }

      const config = await getSSHConfig(machine.name);
      const rsync = Bun.spawn(
        [
          "rsync",
          "-az",
          "-e",
          config.sshCmd,
          tmpTar,
          `${config.dest}:${tmpTar}`,
        ],
        { stdout: "inherit", stderr: "inherit" },
      );
      if ((await rsync.exited) !== 0) {
        throw new Error("rsync image to remote failed");
      }

      const load = await exec(machine, ["docker", "load", "-i", tmpTar]);
      if (load.exitCode !== 0) {
        throw new Error("docker load on remote failed");
      }

      // Cleanup temp tar on both sides
      await exec(localMachine, ["rm", "-f", tmpTar]);
      await exec(machine, ["rm", "-f", tmpTar]);
    }
  }

  // 2. Generate compose file locally
  generateAgentCompose(agent.name);

  // 3. For remote, push compose file to the remote machine
  if (!isLocal) {
    const composePath = path.join(process.cwd(), "docker-compose.agents.yml");
    const config = await getSSHConfig(machine.name);
    const rsync = Bun.spawn(
      [
        "rsync",
        "-az",
        "-e",
        config.sshCmd,
        composePath,
        `${config.dest}:~/agency/docker-compose.agents.yml`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    if ((await rsync.exited) !== 0) {
      throw new Error("rsync compose file to remote failed");
    }
  }

  // 4. Start container via docker compose
  const composeArgs = isLocal
    ? [
        "docker",
        "compose",
        "-f",
        "docker-compose.agents.yml",
        "up",
        "-d",
        serviceName,
      ]
    : [
        "docker",
        "compose",
        "-f",
        "~/agency/docker-compose.agents.yml",
        "up",
        "-d",
        serviceName,
      ];
  const up = await exec(machine, composeArgs, { stdout: "inherit" });
  if (up.exitCode !== 0) {
    throw new Error("docker compose up failed");
  }

  // 5. Push config into the container
  if (isLocal) {
    await pushToDocker(agent.name, agent.role);
  } else {
    // Push config to remote host first, then docker cp inside the remote
    await pushToRemote(agent.name, agent.role, machine.host, machine.name);

    const profileDir = `~/.openclaw-${agent.name}`;
    const containerProfileDir = `/root/.openclaw-${agent.name}`;

    // docker cp config and workspace into container on remote
    await exec(machine, [
      "bash",
      "-c",
      [
        `docker exec ${serviceName} sh -c "rm -rf ${containerProfileDir}/workspace && mkdir -p ${containerProfileDir}/agents/main/agent ${containerProfileDir}/workspace"`,
        `docker cp ${profileDir}/openclaw.json ${serviceName}:${containerProfileDir}/openclaw.json`,
        `docker cp ${profileDir}/agents/main/agent/auth-profiles.json ${serviceName}:${containerProfileDir}/agents/main/agent/auth-profiles.json`,
        `cd ${profileDir}/workspace && tar -ch --dereference . | docker cp - ${serviceName}:${containerProfileDir}/workspace`,
      ].join(" && "),
    ]);
  }

  // 6. Inject env vars into the running container
  const envVars = await getEnvVars();
  const allEnvVars: Record<string, string> = {
    AGENCY_AGENT_NAME: agent.name,
    AGENCY_API_URL: isLocal
      ? `http://host.docker.internal:${process.env.PORT ?? 3100}`
      : `http://localhost:${process.env.PORT ?? 3100}`,
    ...envVars,
  };
  const envScript =
    Object.entries(allEnvVars)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n";

  const writeEnv = await exec(
    machine,
    [
      "docker",
      "exec",
      "-i",
      serviceName,
      "sh",
      "-c",
      "cat > /etc/profile.d/agent-env.sh",
    ],
    { stdin: new TextEncoder().encode(envScript) },
  );
  if (writeEnv.exitCode !== 0) {
    console.error(`[deploy] failed to inject env vars into ${serviceName}`);
  }

  // 7. Start openclaw inside the container
  const startCmd = `source /etc/profile.d/agent-env.sh && OPENCLAW_HOME=/root/.openclaw-${agent.name} openclaw --profile ${agent.name} gateway run --port 18789`;
  await exec(machine, [
    "docker",
    "exec",
    "-d",
    serviceName,
    "bash",
    "-c",
    startCmd,
  ]);

  console.log(
    `[deploy] docker agent ${agent.name} started on ${machine.name}`,
  );

  // 8. For remote docker, open reverse tunnel
  if (!isLocal) {
    await startTunnel(agent.name, machine.host, machine.name);
  }
}

/**
 * Unified stop: dispatch by runtime x machine.
 */
export async function stop(agent: DeployAgent): Promise<void> {
  let machine: Machine;
  if (agent.machine) {
    machine = resolveMachine(agent.machine);
  } else {
    const local = getLocalMachine();
    if (!local) {
      // Best effort — nothing to stop if no machine found
      console.warn(
        `[deploy] stop: no machine for ${agent.name}, skipping`,
      );
      return;
    }
    machine = local;
  }

  const isLocal = machine.auth === "local";
  const runtime = agent.runtime || "system";

  if (runtime === "docker") {
    // Stop docker container via compose
    const composeFile = isLocal
      ? "docker-compose.agents.yml"
      : "~/agency/docker-compose.agents.yml";
    await exec(machine, [
      "docker",
      "compose",
      "-f",
      composeFile,
      "stop",
      `agent-${agent.name}`,
    ]);
  } else {
    // runtime === "system"
    if (isLocal) {
      stopLocal(agent.name);
    } else {
      // Kill remote system process
      try {
        await exec(machine, [
          "bash",
          "-c",
          `pkill -f "openclaw --profile ${agent.name}" || true`,
        ]);
      } catch {
        // best-effort
      }
    }
  }

  // Always close tunnel for remote machines
  if (!isLocal) {
    stopTunnel(agent.name);
  }
}
