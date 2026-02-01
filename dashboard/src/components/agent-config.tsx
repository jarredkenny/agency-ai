"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/api";
import { FileEditor } from "./file-editor";
import { CreateAgentModal } from "./create-agent-modal";
import { AgentDetailPanel } from "./agent-detail-panel";
import type { Agent } from "./agent-sidebar";

const FILE_TABS = [
  { label: "Soul", file: "SOUL.md" },
  { label: "User", file: "USER.md" },
  { label: "Agents", file: "AGENTS.md" },
  { label: "Memory", file: "MEMORY.md" },
  { label: "Tools", file: "TOOLS.md" },
] as const;

export function AgentConfig({ agents: initialAgents }: { agents: Agent[] }) {
  const [agents, setAgents] = useState(initialAgents);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(FILE_TABS[0].file);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const agent = agents.find((a) => a.name === selectedAgent);

  const refreshAgents = useCallback(async () => {
    try {
      const rows = await fetchApi("/agents");
      setAgents(rows);
    } catch {}
  }, []);

  // Auto-select first agent
  useEffect(() => {
    if (!selectedAgent && agents.length > 0) {
      setSelectedAgent(agents[0].name);
    }
  }, [agents, selectedAgent]);

  // Load file content
  useEffect(() => {
    if (!selectedAgent) return;
    setLoading(true);
    setError(null);
    fetchApi(`/agents/${selectedAgent}/files/${activeTab}`)
      .then((data) => {
        setContent(data.content);
        setLoading(false);
      })
      .catch((e) => {
        setError("File not found");
        setContent("");
        setLoading(false);
      });
  }, [selectedAgent, activeTab]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Agent list sidebar */}
      <div
        className="w-[240px] shrink-0 overflow-y-auto border-r"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
        >
          <span className="text-xs font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
            AGENTS
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
            title="Create agent"
          >
            +
          </button>
        </div>
        <div className="space-y-0.5 px-2">
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setSelectedAgent(a.name);
                setActiveTab(FILE_TABS[0].file);
              }}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors"
              style={{
                background:
                  selectedAgent === a.name ? "var(--bg-tertiary)" : "transparent",
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: "var(--accent-green)" }}
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
                  <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {a.role}
                  </span>
                  {(a as any).location && (
                    <span
                      className="text-[10px] px-1 py-0.5 rounded"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
                    >
                      {(a as any).location}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {agent ? (
          <>
            {/* Agent detail panel */}
            <AgentDetailPanel
              agent={agent as any}
              onRefresh={() => {
                refreshAgents();
                // If agent was deleted, deselect
                if (!agents.find((a) => a.name === selectedAgent)) {
                  setSelectedAgent(null);
                }
              }}
            />

            {/* File tabs */}
            <div
              className="flex gap-0 border-b px-4"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
            >
              {FILE_TABS.map((tab) => (
                <button
                  key={tab.file}
                  onClick={() => setActiveTab(tab.file)}
                  className="px-3 py-2 text-sm font-medium transition-colors relative"
                  style={{
                    color:
                      activeTab === tab.file
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                  }}
                >
                  {tab.label}
                  {activeTab === tab.file && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ background: "var(--accent-green)" }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* File content */}
            {loading ? (
              <div
                className="flex-1 flex items-center justify-center"
                style={{ color: "var(--text-muted)" }}
              >
                Loading...
              </div>
            ) : error ? (
              <div
                className="flex-1 flex items-center justify-center"
                style={{ color: "var(--text-muted)" }}
              >
                {error}
              </div>
            ) : (
              <FileEditor content={content} filename={activeTab} />
            )}
          </>
        ) : (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            Select an agent
          </div>
        )}
      </div>

      <CreateAgentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          refreshAgents();
        }}
      />
    </div>
  );
}
