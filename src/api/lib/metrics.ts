import * as os from "os";
import { db } from "../db/client.js";
import { sshExec } from "./ssh.js";

export interface AgentMetrics {
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  updatedAt: string;
}

/** Latest metrics snapshot per agent name */
const metricsStore = new Map<string, AgentMetrics>();

export function getMetrics(agentName: string): AgentMetrics | null {
  return metricsStore.get(agentName) ?? null;
}

export function getAllMetrics(): Map<string, AgentMetrics> {
  return metricsStore;
}

function localMetrics(): AgentMetrics {
  const cpus = os.cpus();
  const loadAvg1 = os.loadavg()[0];
  const cpuPercent = Math.min(100, Math.round((loadAvg1 / cpus.length) * 100));
  const memTotal = os.totalmem();

  // Use MemAvailable from /proc/meminfo (accounts for reclaimable cache/buffers)
  // os.freemem() only returns MemFree which excludes cache, making usage look inflated
  let memAvailable = os.freemem(); // fallback
  try {
    const meminfo = require("fs").readFileSync("/proc/meminfo", "utf-8");
    const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (match) memAvailable = parseInt(match[1], 10) * 1024;
  } catch {}

  return {
    cpuPercent,
    memUsedBytes: memTotal - memAvailable,
    memTotalBytes: memTotal,
    updatedAt: new Date().toISOString(),
  };
}

async function remoteMetrics(machineName: string): Promise<AgentMetrics | null> {
  try {
    const { exitCode, stdout } = await sshExec(
      "", // host unused — sshExec resolves from machineName
      "cat /proc/loadavg; nproc; free -b | grep Mem",
      machineName,
    );
    if (exitCode !== 0) return null;

    const lines = stdout.trim().split("\n");
    if (lines.length < 3) return null;

    // /proc/loadavg: "0.45 0.30 0.25 1/234 5678"
    const loadAvg1 = parseFloat(lines[0].split(" ")[0]);
    const nproc = parseInt(lines[1], 10) || 1;
    const cpuPercent = Math.min(100, Math.round((loadAvg1 / nproc) * 100));

    // free -b Mem line: "Mem:  total  used  free  shared  buff/cache  available"
    const memParts = lines[2].split(/\s+/);
    const memTotal = parseInt(memParts[1], 10) || 0;
    const memUsed = parseInt(memParts[2], 10) || 0;

    return {
      cpuPercent,
      memUsedBytes: memUsed,
      memTotalBytes: memTotal,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function dockerMetrics(agentName: string): Promise<AgentMetrics | null> {
  try {
    const containerName = `agent-${agentName}`;
    const proc = Bun.spawn(
      ["docker", "stats", "--no-stream", "--format", "{{json .}}", containerName],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    if (exitCode !== 0) return null;

    const stats = JSON.parse(stdout.trim());
    // CPUPerc is like "12.34%"
    const cpuPercent = Math.round(parseFloat(stats.CPUPerc) || 0);
    // MemUsage is like "123.4MiB / 7.773GiB"
    const memParts = (stats.MemUsage as string).split("/").map((s: string) => s.trim());
    const memUsed = parseMemStr(memParts[0]);
    const memTotal = parseMemStr(memParts[1]);

    return {
      cpuPercent,
      memUsedBytes: memUsed,
      memTotalBytes: memTotal,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function parseMemStr(s: string): number {
  const match = s.match(/^([\d.]+)\s*(\w+)$/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "b") return val;
  if (unit === "kib" || unit === "kb") return val * 1024;
  if (unit === "mib" || unit === "mb") return val * 1024 * 1024;
  if (unit === "gib" || unit === "gb") return val * 1024 * 1024 * 1024;
  if (unit === "tib" || unit === "tb") return val * 1024 * 1024 * 1024 * 1024;
  return val;
}

export async function collectAllMetrics(): Promise<void> {
  const agents = await db
    .selectFrom("agents")
    .selectAll()
    .execute();

  if (agents.length === 0) return;

  // Group by machine for metrics collection
  const byMachine = new Map<string, { agents: string[]; runtime: string }>();
  const dockerAgents: string[] = [];

  for (const a of agents) {
    const runtime = (a as any).runtime ?? "system";
    const machineName = (a as any).machine;

    // Docker containers get individual metrics regardless of machine
    if (runtime === "docker") {
      dockerAgents.push(a.name);
      continue;
    }

    // System agents grouped by machine
    if (!machineName) continue;
    if (!byMachine.has(machineName)) byMachine.set(machineName, { agents: [], runtime });
    byMachine.get(machineName)!.agents.push(a.name);
  }

  // Machine metrics: local or SSH per machine
  const { readMachines } = await import("../routes/machines.js");
  const machines = readMachines();

  const machinePromises = [...byMachine.entries()].map(async ([machineName, { agents: names }]) => {
    const machine = machines.find((m) => m.name === machineName);
    if (!machine) return;

    const m = machine.auth === "local" ? localMetrics() : await remoteMetrics(machineName);
    if (m) {
      for (const name of names) {
        metricsStore.set(name, m);
      }
    }
  });

  // Docker: one call per container
  const dockerPromises = dockerAgents.map(async (name) => {
    const m = await dockerMetrics(name);
    if (m) metricsStore.set(name, m);
  });

  await Promise.allSettled([...machinePromises, ...dockerPromises]);

  // Clean up metrics for agents that no longer exist
  const knownNames = new Set(agents.map((a) => a.name));
  for (const name of metricsStore.keys()) {
    if (!knownNames.has(name)) {
      metricsStore.delete(name);
    }
  }
}
