"use client";

import { useEffect, useState } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface MachineInfo {
  name: string;
  host: string;
  user: string;
  port: number;
}

export function CreateAgentModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [location, setLocation] = useState("docker");
  const [machine, setMachine] = useState("");
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [slackOpen, setSlackOpen] = useState(false);
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackAppToken, setSlackAppToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchApi("/agents/roles").then((r) => {
        setRoles(r);
        if (r.length > 0 && !role) setRole(r[0]);
      });
      fetchApi("/machines").then((m) => {
        setMachines(m);
        if (m.length > 0 && !machine) setMachine(m[0].name);
      });
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await mutateApi("/agents", "POST", {
        name,
        role,
        location,
        ...(location === "remote" && machine ? { machine } : {}),
        ...(slackBotToken ? { slack_bot_token: slackBotToken } : {}),
        ...(slackAppToken ? { slack_app_token: slackAppToken } : {}),
      });
      setName("");
      setSlackBotToken("");
      setSlackAppToken("");
      setSlackOpen(false);
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
        className="rounded-lg shadow-xl w-[420px] max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold">Create Agent</h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="text-sm px-3 py-2 rounded" style={{ background: "#fef2f2", color: "#dc2626" }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              required
              pattern="^[a-z][a-z0-9-]{1,30}$"
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            />
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Lowercase letters, numbers, hyphens. 2-31 chars.
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Location</label>
            <div className="flex gap-3">
              {["docker", "remote", "local"].map((loc) => (
                <label key={loc} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="location"
                    value={loc}
                    checked={location === loc}
                    onChange={() => setLocation(loc)}
                  />
                  {loc.charAt(0).toUpperCase() + loc.slice(1)}
                </label>
              ))}
            </div>
          </div>

          {location === "remote" && (
            <div>
              <label className="block text-sm font-medium mb-1">Machine</label>
              {machines.length === 0 ? (
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No machines configured. Add one in Settings → Machines.
                </div>
              ) : (
                <select
                  value={machine}
                  onChange={(e) => setMachine(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-sm"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  {machines.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.user}@{m.host})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setSlackOpen(!slackOpen)}
              className="text-sm font-medium flex items-center gap-1"
              style={{ color: "var(--text-secondary)" }}
            >
              <span style={{ display: "inline-block", transform: slackOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                ▶
              </span>
              Slack Configuration
            </button>
            {slackOpen && (
              <div className="mt-2 space-y-3 pl-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Bot Token</label>
                  <input
                    type="password"
                    value={slackBotToken}
                    onChange={(e) => setSlackBotToken(e.target.value)}
                    placeholder="xoxb-..."
                    className="w-full px-3 py-1.5 rounded-md text-sm"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">App Token</label>
                  <input
                    type="password"
                    value={slackAppToken}
                    onChange={(e) => setSlackAppToken(e.target.value)}
                    placeholder="xapp-..."
                    className="w-full px-3 py-1.5 rounded-md text-sm"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                  />
                </div>
              </div>
            )}
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
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
