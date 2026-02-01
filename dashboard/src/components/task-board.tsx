"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import { TaskCard, type Task } from "./task-card";
import { TaskDetail } from "./task-detail";
import { CreateTaskModal } from "./create-task-modal";

const COLUMNS = ["inbox", "assigned", "in_progress", "review", "done"] as const;

const columnLabels: Record<string, string> = {
  inbox: "INBOX",
  assigned: "ASSIGNED",
  in_progress: "IN PROGRESS",
  review: "REVIEW",
  done: "DONE",
};

export function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const load = () => fetchApi("/tasks").then(setTasks).catch(console.error);
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex-1 overflow-x-auto p-4">
      <div className="flex gap-4 min-w-0">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col);
          return (
            <div key={col} className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <h3
                  className="text-xs font-bold tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {columnLabels[col]}
                </h3>
                {col === "inbox" && (
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold leading-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                    title="Create task"
                  >
                    +
                  </button>
                )}
                <span
                  className="text-[11px] font-medium px-1.5 rounded-full"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
                >
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {colTasks.map((t) => (
                  <TaskCard key={t.id} task={t} onClick={() => setSelectedId(t.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {selectedId && <TaskDetail taskId={selectedId} onClose={() => setSelectedId(null)} />}
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => fetchApi("/tasks").then(setTasks).catch(console.error)}
      />
    </div>
  );
}
