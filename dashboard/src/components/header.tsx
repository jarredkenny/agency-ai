"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

export type View = "mission" | "config" | "settings" | "skills" | "roles" | "knowledge" | "documents";

interface HeaderProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

const NAV_ITEMS: { key: View; label: string }[] = [
  { key: "mission", label: "Tasks" },
  { key: "config", label: "Agents" },
  { key: "roles", label: "Roles" },
  { key: "skills", label: "Skills" },
  { key: "documents", label: "Docs" },
  { key: "knowledge", label: "Knowledge" },
];

export function Header({ activeView, onViewChange }: HeaderProps) {
  const [clock, setClock] = useState("");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const checkOnline = async () => {
      try {
        await fetchApi("/agents");
        setOnline(true);
      } catch {
        setOnline(false);
      }
    };
    checkOnline();
    const id = setInterval(checkOnline, 5000);
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

      <div className="flex items-center gap-4 text-sm">
        <button
          onClick={() => onViewChange("settings")}
          className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
          style={{
            background: activeView === "settings" ? "var(--bg-tertiary)" : "transparent",
            color: activeView === "settings" ? "var(--text-primary)" : "var(--text-secondary)",
          }}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.86 1.45a1.2 1.2 0 0 1 2.28 0l.2.6a1.2 1.2 0 0 0 1.57.7l.58-.24a1.2 1.2 0 0 1 1.6 1.14l-.02.63a1.2 1.2 0 0 0 1.04 1.22l.62.1a1.2 1.2 0 0 1 .8 1.97l-.43.46a1.2 1.2 0 0 0 0 1.6l.43.46a1.2 1.2 0 0 1-.8 1.97l-.62.1a1.2 1.2 0 0 0-1.04 1.22l.02.63a1.2 1.2 0 0 1-1.6 1.14l-.58-.24a1.2 1.2 0 0 0-1.57.7l-.2.6a1.2 1.2 0 0 1-2.28 0l-.2-.6a1.2 1.2 0 0 0-1.57-.7l-.58.24a1.2 1.2 0 0 1-1.6-1.14l.02-.63a1.2 1.2 0 0 0-1.04-1.22l-.62-.1a1.2 1.2 0 0 1-.8-1.97l.43-.46a1.2 1.2 0 0 0 0-1.6l-.43-.46a1.2 1.2 0 0 1 .8-1.97l.62-.1A1.2 1.2 0 0 0 2.91 4.3l-.02-.63a1.2 1.2 0 0 1 1.6-1.14l.58.24a1.2 1.2 0 0 0 1.57-.7l.2-.6Z" />
            <circle cx="8" cy="8" r="2.5" />
          </svg>
        </button>
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
