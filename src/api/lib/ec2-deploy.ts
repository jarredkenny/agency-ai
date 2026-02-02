import { getSSHConfig, sshExec } from "./ssh.js";
import { startTunnel, stopTunnel } from "./tunnels.js";
import { readFleet } from "./fleet-sync.js";
import { provisionAuthRemote } from "./provision-auth.js";
import { join } from "path";

export async function deployEC2(
  agentName: string,
  role: string,
): Promise<void> {
  const fleet = readFleet();
  const fleetAgent = fleet.agents[agentName];
  const host = fleetAgent?.host;
  if (!host) {
    throw new Error(
      "No host configured for EC2 agent. Set 'host' in fleet.json or agent config.",
    );
  }

  const { keyPath, user } = await getSSHConfig();

  // 1. Rsync role workspace to remote
  const rolesDir = join(process.cwd(), `roles/${role}/`);
  const rsyncProc = Bun.spawn(
    [
      "rsync",
      "-az",
      "--delete",
      "-e",
      `ssh -i ${keyPath} -o StrictHostKeyChecking=no`,
      rolesDir,
      `${user}@${host}:~/agency/roles/${role}/`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  const rsyncCode = await rsyncProc.exited;
  if (rsyncCode !== 0) {
    throw new Error(`rsync failed with exit code ${rsyncCode}`);
  }

  // 2. Provision auth credentials on remote
  await provisionAuthRemote(agentName, host);

  // 3. Start agent process on remote
  const startCmd = [
    `cd ~/agency`,
    `export AGENCY_AGENT_NAME=${agentName}`,
    `export AGENCY_ROLE=${role}`,
    `nohup bun packages/agent/src/index.ts > /tmp/agent-${agentName}.log 2>&1 &`,
    `echo $!`,
  ].join(" && ");

  const result = await sshExec(host, startCmd);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to start agent process: ${result.stderr}`);
  }
  console.log(
    `[ec2-deploy] started agent ${agentName} on ${host}, pid=${result.stdout.trim()}`,
  );

  // 4. Open reverse tunnel
  await startTunnel(agentName, host);
}

export async function stopEC2(agentName: string): Promise<void> {
  const fleet = readFleet();
  const fleetAgent = fleet.agents[agentName];
  const host = fleetAgent?.host;

  // Kill remote process
  if (host) {
    try {
      await sshExec(
        host,
        `pkill -f "AGENCY_AGENT_NAME=${agentName}" || true`,
      );
    } catch {
      // best-effort
    }
  }

  stopTunnel(agentName);
}
