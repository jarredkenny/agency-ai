"use client";

import { useEffect, useState } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface Notification {
  id: string;
  content: string;
  task_id: string | null;
  created_at: string;
}

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);

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
    const loadNotifs = () => {
      fetchApi("/notifications/pending/human").then(setNotifications).catch(() => {});
    };
    loadStats();
    loadNotifs();
    const id = setInterval(() => { loadStats(); loadNotifs(); }, 5000);
    return () => clearInterval(id);
  }, []);

  const dismissNotif = async (id: string) => {
    await mutateApi(`/notifications/deliver/${id}`, "POST");
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

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
        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative px-2 py-1 rounded text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            {notifications.length > 0 && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ background: "var(--accent-red, #ef4444)" }}
              >
                {notifications.length}
              </span>
            )}
            Bell
          </button>
          {showNotifs && notifications.length > 0 && (
            <div
              className="absolute right-0 top-full mt-1 w-80 rounded-lg shadow-lg overflow-hidden z-50"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              <div className="px-3 py-2 text-xs font-bold" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                NOTIFICATIONS
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="px-3 py-2 flex justify-between items-start gap-2 text-sm"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <span style={{ color: "var(--text-primary)" }}>{n.content}</span>
                    <button
                      onClick={() => dismissNotif(n.id)}
                      className="shrink-0 text-xs px-1 rounded"
                      style={{ color: "var(--text-muted)" }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
