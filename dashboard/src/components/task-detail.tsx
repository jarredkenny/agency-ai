"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi, mutateApi } from "@/lib/api";
import type { Task } from "./task-card";

const STATUSES = ["inbox", "assigned", "in_progress", "review", "done"] as const;

export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [agents, setAgents] = useState<{ name: string }[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [assignAgent, setAssignAgent] = useState("");

  const reload = useCallback(() => {
    fetchApi(`/tasks/${taskId}`).then(setTask).catch(console.error);
  }, [taskId]);

  useEffect(() => {
    reload();
    fetchApi("/agents").then(setAgents).catch(console.error);
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [reload]);

  const handleStatusChange = async (status: string) => {
    await mutateApi(`/tasks/${taskId}`, "PATCH", { status, agent_name: "human" });
    reload();
  };

  const handleAssign = async () => {
    if (!assignAgent) return;
    await mutateApi(`/tasks/${taskId}/assign`, "POST", { agent_name: assignAgent });
    setAssignAgent("");
    reload();
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await mutateApi(`/tasks/${taskId}/messages`, "POST", {
        from_agent: "human",
        content: newMessage.trim(),
      });
      setNewMessage("");
      reload();
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 w-[600px] overflow-y-auto z-50 shadow-xl flex flex-col"
        style={{ background: "var(--bg-secondary)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="p-6 flex-1 overflow-y-auto">
          <button
            onClick={onClose}
            className="mb-4 text-sm font-medium px-2 py-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            Close
          </button>
          {task && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">{task.title}</h2>

              {/* Status + Assignment controls */}
              <div className="flex flex-wrap gap-2 items-center">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className="px-2 py-1 rounded text-xs font-medium transition-colors"
                    style={{
                      background: task.status === s ? "var(--accent-green)" : "var(--bg-tertiary)",
                      color: task.status === s ? "white" : "var(--text-secondary)",
                    }}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>

              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Priority: P{task.priority} &middot; Assignees:{" "}
                {task.assignees?.map((a) => a.name).join(", ") || "none"}
              </div>

              {/* Assign agent */}
              <div className="flex gap-2 items-center">
                <select
                  value={assignAgent}
                  onChange={(e) => setAssignAgent(e.target.value)}
                  className="px-2 py-1 rounded text-sm"
                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
                >
                  <option value="">Assign agent...</option>
                  {agents
                    .filter((a) => a.name !== "human")
                    .map((a) => (
                      <option key={a.name} value={a.name}>{a.name}</option>
                    ))}
                </select>
                {assignAgent && (
                  <button
                    onClick={handleAssign}
                    className="px-3 py-1 rounded text-xs font-medium text-white"
                    style={{ background: "var(--accent-blue)" }}
                  >
                    Assign
                  </button>
                )}
              </div>

              {task.description && (
                <div>
                  <h3
                    className="text-xs font-bold tracking-wider mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    DESCRIPTION
                  </h3>
                  <pre
                    className="text-sm whitespace-pre-wrap rounded p-3"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    {task.description}
                  </pre>
                </div>
              )}
              {task.design && (
                <div>
                  <h3
                    className="text-xs font-bold tracking-wider mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    DESIGN
                  </h3>
                  <pre
                    className="text-sm whitespace-pre-wrap rounded p-3"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    {task.design}
                  </pre>
                </div>
              )}
              {task.acceptance && (
                <div>
                  <h3
                    className="text-xs font-bold tracking-wider mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ACCEPTANCE
                  </h3>
                  <pre
                    className="text-sm whitespace-pre-wrap rounded p-3"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    {task.acceptance}
                  </pre>
                </div>
              )}

              {/* Messages */}
              <div>
                <h3
                  className="text-xs font-bold tracking-wider mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  MESSAGES
                </h3>
                <div className="space-y-2 mb-3">
                  {task.messages && task.messages.length > 0 ? (
                    task.messages.map((m, i) => (
                      <div
                        key={i}
                        className="pl-3"
                        style={{ borderLeft: "2px solid var(--border)" }}
                      >
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          <span className="font-bold" style={{ color: "var(--text-secondary)" }}>
                            {m.from_name ?? "?"}
                          </span>{" "}
                          &middot; {new Date(m.created_at).toLocaleString()}
                        </div>
                        <div className="text-sm mt-0.5">{m.content}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      No messages yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Message composer — pinned to bottom */}
        {task && (
          <div
            className="p-4 border-t"
            style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder="Write a message..."
                className="flex-1 px-3 py-2 rounded-md text-sm"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
              />
              <button
                onClick={handleSendMessage}
                disabled={sending || !newMessage.trim()}
                className="px-4 py-2 rounded-md text-sm font-medium text-white"
                style={{
                  background: "var(--accent-green)",
                  opacity: sending || !newMessage.trim() ? 0.5 : 1,
                }}
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
