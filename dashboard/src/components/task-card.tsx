"use client";

export interface Task {
  id: string;
  title: string;
  priority: number;
  task_type: string;
  status: string;
  assignees?: { id: string; name: string }[];
  description?: string;
  design?: string;
  acceptance?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  messages?: { from_name: string | null; created_at: string; content: string }[];
}

const priorityBorder: Record<number, string> = {
  1: "var(--accent-red)",
  2: "var(--accent-yellow)",
  3: "var(--border)",
};

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `about ${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const assignee = task.assignees?.[0];
  const timestamp = task.updated_at ?? task.created_at;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg p-3 transition-all hover:shadow-md"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-light)",
        borderLeft: `3px solid ${priorityBorder[task.priority] ?? "var(--border)"}`,
      }}
    >
      <div className="font-semibold text-sm mb-1 leading-snug">{task.title}</div>
      {task.description && (
        <div
          className="text-xs mb-2 leading-relaxed line-clamp-2"
          style={{ color: "var(--text-secondary)" }}
        >
          {task.description}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {assignee && (
            <>
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                style={{ background: "var(--accent-blue)" }}
              >
                {assignee.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {assignee.name}
              </span>
            </>
          )}
          {timestamp && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {assignee ? " \u00b7 " : ""}
              {timeAgo(timestamp)}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          {task.task_type}
        </span>
        {task.tags?.map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}
