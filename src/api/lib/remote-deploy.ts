import { sshExec, getSSHConfig } from "./ssh.js";
import { startTunnel, stopTunnel } from "./tunnels.js";
import { readFleet } from "./fleet-sync.js";
import { provisionAgent, pushToRemote } from "./provision-openclaw.js";

export async function deployRemote(
  agentName: string,
  role: string,
  machineName?: string,
): Promise<void> {
  const fleet = readFleet();
  const fleetAgent = fleet.agents[agentName];
  const machine = machineName ?? fleetAgent?.machine;

  if (!machine) {
    throw new Error(
      "No machine configured for remote agent. Select a machine when creating the agent.",
    );
  }

  const { host } = await getSSHConfig(machine);

  // 1. Provision config + auth locally
  await provisionAgent(agentName, role, "remote");

  // 2. Push everything to remote (config dir + role workspace)
  await pushToRemote(agentName, role, host, machine);

  // 3. Start openclaw gateway on remote
  const startCmd = [
    `nohup openclaw --profile ${agentName} gateway run --port 18789 > /tmp/agent-${agentName}.log 2>&1 &`,
    `echo $!`,
  ].join(" && ");

  const result = await sshExec(host, startCmd, machine);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to start agent process: ${result.stderr}`);
  }
  console.log(
    `[remote-deploy] started agent ${agentName} on ${host}, pid=${result.stdout.trim()}`,
  );

  // 4. Open reverse tunnel
  await startTunnel(agentName, host, machine);
}

export async function stopRemote(agentName: string, machineName?: string): Promise<void> {
  const fleet = readFleet();
  const fleetAgent = fleet.agents[agentName];
  const machine = machineName ?? fleetAgent?.machine;

  if (machine) {
    try {
      const { host } = await getSSHConfig(machine);
      await sshExec(
        host,
        `pkill -f "openclaw --profile ${agentName}" || true`,
        machine,
      );
    } catch {
      // best-effort
    }
  }

  stopTunnel(agentName);
}
