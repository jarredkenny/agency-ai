"use client";

import { useState, useEffect } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  runtime: string | null;
  machine: string | null;
  slack_bot_token: string | null;
  slack_app_token: string | null;
}

interface Props {
  agent: Agent;
  onRefresh: () => void;
}

export function AgentDetailPanel({ agent, onRefresh }: Props) {
  const [deploying, setDeploying] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [slackBotToken, setSlackBotToken] = useState(agent.slack_bot_token ?? "");
  const [slackAppToken, setSlackAppToken] = useState(agent.slack_app_token ?? "");
  const [savingSlack, setSavingSlack] = useState(false);

  // Sync Slack tokens when agent changes
  useEffect(() => {
    setSlackBotToken(agent.slack_bot_token ?? "");
    setSlackAppToken(agent.slack_app_token ?? "");
  }, [agent.slack_bot_token, agent.slack_app_token]);

  const handleDeploy = async () => {
    setDeploying(true);
    setMessage(null);
    try {
      const res = await mutateApi(`/agents/${agent.name}/deploy`, "POST");
      setMessage(res.instructions ?? `Deployed (${res.method})`);
      onRefresh();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    setMessage(null);
    try {
      await mutateApi(`/agents/${agent.name}/stop`, "POST");
      setMessage("Stopped");
      onRefresh();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setStopping(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await mutateApi(`/agents/${agent.name}`, "DELETE");
      onRefresh();
    } catch (err: any) {
      setMessage(err.message);
      setDeleting(false);
    }
  };

  const handleSaveSlack = async () => {
    setSavingSlack(true);
    try {
      await mutateApi(`/agents/${agent.name}`, "PATCH", {
        slack_bot_token: slackBotToken || null,
        slack_app_token: slackAppToken || null,
      });
      setMessage("Slack tokens saved");
      onRefresh();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSavingSlack(false);
    }
  };

  const statusColor =
    agent.status === "active" ? "#22c55e" :
    agent.status === "blocked" ? "#ef4444" : "#9ca3af";

  return (
    <div className="p-5 space-y-4 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: statusColor }} />
          <span className="font-semibold">{agent.name}</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
            {agent.role}
          </span>
          {agent.runtime && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
              {agent.runtime}
            </span>
          )}
          {agent.machine && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
              {agent.machine}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
            style={{ background: "#22c55e", opacity: deploying ? 0.6 : 1 }}
          >
            {deploying ? "Deploying..." : "Deploy"}
          </button>
          <button
            onClick={handleStop}
            disabled={stopping}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
            style={{ background: "#f59e0b", opacity: stopping ? 0.6 : 1 }}
          >
            {stopping ? "Stopping..." : "Stop"}
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
              style={{ background: "#ef4444" }}
            >
              Delete
            </button>
          ) : (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
              style={{ background: "#dc2626", opacity: deleting ? 0.6 : 1 }}
            >
              {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
          {message}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Slack Tokens</div>
        <div className="flex gap-2 items-end">
          <input
            type="password"
            value={slackBotToken}
            onChange={(e) => setSlackBotToken(e.target.value)}
            placeholder="Bot Token"
            className="flex-1 px-2 py-1.5 rounded text-xs"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          />
          <input
            type="password"
            value={slackAppToken}
            onChange={(e) => setSlackAppToken(e.target.value)}
            placeholder="App Token"
            className="flex-1 px-2 py-1.5 rounded text-xs"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={handleSaveSlack}
            disabled={savingSlack}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: "var(--bg-tertiary)" }}
          >
            {savingSlack ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
