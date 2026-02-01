"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import type { Task } from "./task-card";

export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [task, setTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchApi(`/tasks/${taskId}`).then(setTask).catch(console.error);
  }, [taskId]);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 w-[600px] overflow-y-auto p-6 z-50 shadow-xl"
        style={{ background: "var(--bg-secondary)", borderLeft: "1px solid var(--border)" }}
      >
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
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Status: {task.status} &middot; Priority: P{task.priority} &middot; Assignees:{" "}
              {task.assignees?.map((a) => a.name).join(", ") || "none"}
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
            {task.messages && task.messages.length > 0 && (
              <div>
                <h3
                  className="text-xs font-bold tracking-wider mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  MESSAGES
                </h3>
                <div className="space-y-2">
                  {task.messages.map((m, i) => (
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
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
