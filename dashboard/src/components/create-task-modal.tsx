"use client";

import { useEffect, useState } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTaskModal({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(2);
  const [taskType, setTaskType] = useState("task");
  const [assign, setAssign] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchApi("/agents").then(setAgents).catch(console.error);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await mutateApi("/tasks", "POST", {
        title,
        description,
        from: "human",
        priority,
        task_type: taskType,
        ...(assign ? { assign } : {}),
      });
      setTitle("");
      setDescription("");
      setPriority(2);
      setTaskType("task");
      setAssign("");
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="rounded-lg shadow-xl w-[480px] max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold">Create Task</h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="text-sm px-3 py-2 rounded" style={{ background: "#fef2f2", color: "#dc2626" }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task..."
              required
              rows={4}
              className="w-full px-3 py-2 rounded-md text-sm resize-y"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Priority</label>
            <div className="flex gap-3">
              {[1, 2, 3].map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="priority"
                    value={p}
                    checked={priority === p}
                    onChange={() => setPriority(p)}
                  />
                  P{p}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <div className="flex gap-3">
              {["task", "bug", "feature"].map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="task_type"
                    value={t}
                    checked={taskType === t}
                    onChange={() => setTaskType(t)}
                  />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Assign to (optional)</label>
            <select
              value={assign}
              onChange={(e) => setAssign(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              <option value="">Unassigned</option>
              {agents
                .filter((a) => a.name !== "human")
                .map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name} ({a.role})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div
          className="px-5 py-3 flex justify-end gap-2 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium"
            style={{ background: "var(--bg-tertiary)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ background: "var(--accent-green)", opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? "Creating..." : "Create Task"}
          </button>
        </div>
      </form>
    </div>
  );
}
