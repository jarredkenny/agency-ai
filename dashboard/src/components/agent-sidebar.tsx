"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  location: string | null;
  slack_bot_token: string | null;
  slack_app_token: string | null;
}

const roleBadge: Record<string, { label: string; color: string; bg: string }> = {
  orchestrator: { label: "LEAD", color: "#5c7c5a", bg: "#e8f0e7" },
  implementer: { label: "INT", color: "#5c6b8c", bg: "#e7ecf0" },
  specialist: { label: "SPC", color: "#8c6b5c", bg: "#f0ece7" },
};

function getRoleBadge(role: string) {
  return roleBadge[role] ?? { label: role.slice(0, 3).toUpperCase(), color: "#6b6b6b", bg: "#f0f0f0" };
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
              className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-black/[0.03] cursor-default"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: badge.color }}
              >
                {a.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
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
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: badge.color, background: badge.bg }}
                  >
                    {badge.label}
                  </span>
                  <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {a.role}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
