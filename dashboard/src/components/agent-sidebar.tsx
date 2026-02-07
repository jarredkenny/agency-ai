"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

export interface AgentMetrics {
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  runtime: string | null;
  machine: string | null;
  slack_bot_token: string | null;
  slack_app_token: string | null;
  metrics?: AgentMetrics | null;
}

const roleBadge: Record<string, { label: string; color: string; bg: string }> = {
  orchestrator: { label: "LEAD", color: "#5c7c5a", bg: "#e8f0e7" },
  implementer: { label: "INT", color: "#5c6b8c", bg: "#e7ecf0" },
  specialist: { label: "SPC", color: "#8c6b5c", bg: "#f0ece7" },
};

function getRoleBadge(role: string) {
  return roleBadge[role] ?? { label: role.slice(0, 3).toUpperCase(), color: "#6b6b6b", bg: "#f0f0f0" };
}

const runtimeStyle: Record<string, { label: string; color: string; bg: string }> = {
  system: { label: "SYS", color: "#6b7280", bg: "#f3f4f6" },
  docker: { label: "DOCKER", color: "#2563eb", bg: "#eff6ff" },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

function usageColor(percent: number): string {
  if (percent >= 80) return "#ef4444";
  if (percent >= 50) return "#eab308";
  return "#22c55e";
}

function MetricBar({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const color = usageColor(percent);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] w-6 shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--border)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(2, percent)}%`, background: color }}
        />
      </div>
      <span className="text-[9px] w-12 text-right shrink-0" style={{ color: "var(--text-muted)" }}>
        {detail}
      </span>
    </div>
  );
}

export function AgentSidebar({ agents }: { agents: Agent[] }) {
  return (
    <div
      className="w-[200px] shrink-0 overflow-y-auto border-r"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <div
        className="px-4 py-3 text-xs font-bold tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        AGENTS
      </div>
      <div className="space-y-0.5 px-2">
        {agents.map((a) => {
          const badge = getRoleBadge(a.role);
          return (
            <div
              key={a.id}
              className="px-2 py-2 rounded-md hover:bg-black/[0.03] cursor-default"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      a.status === "active"
                        ? "bg-green-500"
                        : a.status === "blocked"
                          ? "bg-red-500"
                          : "bg-gray-400"
                    }`}
                  />
                  <span className="text-sm font-semibold truncate">{a.name}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: badge.color, background: badge.bg }}
                  >
                    {badge.label}
                  </span>
                  {a.runtime && runtimeStyle[a.runtime] && (
                    <span
                      className="text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{
                        color: runtimeStyle[a.runtime].color,
                        background: runtimeStyle[a.runtime].bg,
                      }}
                    >
                      {runtimeStyle[a.runtime].label}
                    </span>
                  )}
                  {a.machine && (
                    <span
                      className="text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{ color: "#7c3aed", background: "#f5f3ff" }}
                    >
                      {a.machine}
                    </span>
                  )}
                </div>
                {a.metrics && (
                  <div className="mt-1 space-y-0.5">
                    <MetricBar
                      label="CPU"
                      percent={a.metrics.cpuPercent}
                      detail={`${a.metrics.cpuPercent}%`}
                    />
                    <MetricBar
                      label="MEM"
                      percent={
                        a.metrics.memTotalBytes > 0
                          ? Math.round((a.metrics.memUsedBytes / a.metrics.memTotalBytes) * 100)
                          : 0
                      }
                      detail={`${formatBytes(a.metrics.memUsedBytes)}/${formatBytes(a.metrics.memTotalBytes)}`}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
