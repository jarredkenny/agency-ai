"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

interface Activity {
  id: string;
  created_at: string;
  agent_name: string | null;
  summary: string;
  type?: string;
}

const TABS = ["All", "Tasks", "Comments", "Status"] as const;

const TAB_TYPES: Record<string, string[]> = {
  Tasks: ["task_created", "assigned", "document_created"],
  Comments: ["message"],
  Status: ["status_changed"],
};

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function LiveFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("All");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetchApi("/activities?limit=50").then(setActivities).catch(console.error);
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const agents = [...new Set(activities.map((a) => a.agent_name).filter(Boolean))] as string[];

  const filtered = activities.filter((a) => {
    if (agentFilter && a.agent_name !== agentFilter) return false;
    if (activeTab !== "All") {
      const types = TAB_TYPES[activeTab];
      if (types && a.type && !types.includes(a.type)) return false;
    }
    return true;
  });

  return (
    <div
      className="w-[300px] shrink-0 overflow-y-auto border-l flex flex-col"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <div className="px-4 py-3">
        <div
          className="text-xs font-bold tracking-wider mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          LIVE FEED
        </div>
        <div className="flex gap-1 mb-3">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-2 py-1 rounded text-xs font-medium transition-colors"
              style={{
                background: activeTab === tab ? "var(--bg-tertiary)" : "transparent",
                color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          <button
            onClick={() => setAgentFilter(null)}
            className="px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: agentFilter === null ? "var(--accent-green)" : "var(--bg-tertiary)",
              color: agentFilter === null ? "white" : "var(--text-secondary)",
            }}
          >
            All Agents
          </button>
          {agents.map((name) => (
            <button
              key={name}
              onClick={() => setAgentFilter(name)}
              className="px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors"
              style={{
                background: agentFilter === name ? "var(--accent-green)" : "var(--bg-tertiary)",
                color: agentFilter === name ? "white" : "var(--text-secondary)",
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {filtered.map((a) => (
          <div key={a.id} className="flex gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5"
              style={{ background: "var(--accent-olive)" }}
            >
              {(a.agent_name ?? "S").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm">
                <span className="font-semibold">{a.agent_name ?? "system"}</span>{" "}
                <span style={{ color: "var(--text-secondary)" }}>{a.summary}</span>
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {timeAgo(a.created_at)}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
            No activity yet
          </div>
        )}
      </div>
    </div>
  );
}
