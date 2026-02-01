"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

export type View = "mission" | "config" | "settings" | "skills" | "roles";

interface HeaderProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

const NAV_ITEMS: { key: View; label: string }[] = [
  { key: "mission", label: "Mission Control" },
  { key: "config", label: "Agent Config" },
  { key: "settings", label: "Settings" },
  { key: "skills", label: "Skills" },
  { key: "roles", label: "Roles" },
];

export function Header({ activeView, onViewChange }: HeaderProps) {
  const [agentCount, setAgentCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [clock, setClock] = useState("");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const agents = await fetchApi("/agents");
        const tasks = await fetchApi("/tasks");
        setAgentCount(agents.filter((a: any) => a.status === "active").length);
        setTaskCount(tasks.filter((t: any) => t.status !== "done").length);
        setOnline(true);
      } catch {
        setOnline(false);
      }
    };
    loadStats();
    const id = setInterval(loadStats, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      style={{
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}
      className="h-14 flex items-center justify-between px-5 shrink-0"
    >
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold"
            style={{ background: "var(--accent-green)" }}
          >
            A
          </div>
          <span className="font-semibold text-sm">Agency</span>
        </div>
        <nav className="flex gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key)}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{
                background: activeView === item.key ? "var(--bg-tertiary)" : "transparent",
                color: activeView === item.key ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-5 text-sm">
        <div className="flex items-center gap-4" style={{ color: "var(--text-secondary)" }}>
          <span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {agentCount}
            </span>{" "}
            agents active
          </span>
          <span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {taskCount}
            </span>{" "}
            in queue
          </span>
        </div>
        <div className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
          <span className="font-mono text-xs">{clock}</span>
          <span
            className={`w-2 h-2 rounded-full ${online ? "bg-green-500" : "bg-red-500"}`}
          />
        </div>
      </div>
    </header>
  );
}
