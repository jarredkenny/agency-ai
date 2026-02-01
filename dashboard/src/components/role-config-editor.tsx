"use client";

import { useEffect, useState } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface RoleConfig {
  id: string;
  role: string;
  config_type: string;
  content: string;
}

const CONFIG_TYPES = [
  { key: "heartbeat", label: "Heartbeat" },
  { key: "agents-config", label: "Config" },
  { key: "tools", label: "Tools" },
  { key: "agents", label: "Agents" },
  { key: "environment", label: "Environment" },
  { key: "soul", label: "Soul" },
  { key: "identity", label: "Identity" },
];

export function RoleConfigEditor() {
  const [configs, setConfigs] = useState<RoleConfig[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>("heartbeat");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const rows = await fetchApi("/role-configs");
    setConfigs(rows);
    const uniqueRoles = [...new Set(rows.map((r: RoleConfig) => r.role))] as string[];
    setRoles(uniqueRoles);
    if (!selectedRole && uniqueRoles.length > 0) {
      setSelectedRole(uniqueRoles[0]);
    }
  };

  useEffect(() => {
    if (selectedRole && selectedType) {
      const config = configs.find(
        (c) => c.role === selectedRole && c.config_type === selectedType
      );
      setContent(config?.content ?? "");
    }
  }, [selectedRole, selectedType, configs]);

  const currentConfig = configs.find(
    (c) => c.role === selectedRole && c.config_type === selectedType
  );
  const isDirty = currentConfig ? content !== currentConfig.content : content.length > 0;

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const result = await mutateApi(
        `/role-configs/${selectedRole}/${selectedType}`,
        "PUT",
        { content }
      );
      setConfigs((prev) => {
        const idx = prev.findIndex(
          (c) => c.role === selectedRole && c.config_type === selectedType
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = result;
          return next;
        }
        return [...prev, result];
      });
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    // Create a minimal heartbeat config to establish the role
    await mutateApi(`/role-configs/${newRoleName}/heartbeat`, "PUT", {
      content: `# ${newRoleName} Heartbeat\n\nAdd your heartbeat checklist here.`,
    });
    setNewRoleName("");
    setAddingRole(false);
    await loadConfigs();
    setSelectedRole(newRoleName);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Role list sidebar */}
      <div
        className="w-[200px] shrink-0 overflow-y-auto border-r"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
            ROLES
          </span>
          <button
            onClick={() => setAddingRole(true)}
            className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            +
          </button>
        </div>
        {addingRole && (
          <div className="px-3 pb-2 flex gap-1">
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name"
              className="flex-1 px-2 py-1.5 rounded text-xs"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
              onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
              autoFocus
            />
            <button
              onClick={handleAddRole}
              className="px-2 py-1.5 rounded text-xs font-medium text-white"
              style={{ background: "var(--accent-green)" }}
            >
              Add
            </button>
          </div>
        )}
        <div className="space-y-0.5 px-2">
          {roles.map((role) => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: selectedRole === role ? "var(--bg-tertiary)" : "transparent",
                color: selectedRole === role ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* Config type tabs + editor */}
      {selectedRole ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Config type tabs */}
          <div
            className="flex gap-0 border-b px-4"
            style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
          >
            {CONFIG_TYPES.map((ct) => (
              <button
                key={ct.key}
                onClick={() => setSelectedType(ct.key)}
                className="px-3 py-2 text-sm font-medium transition-colors relative"
                style={{
                  color: selectedType === ct.key ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {ct.label}
                {selectedType === ct.key && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ background: "var(--accent-green)" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Save bar */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {selectedRole} / {selectedType}
            </span>
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
              style={{
                background: "var(--accent-green)",
                opacity: !isDirty || saving ? 0.4 : 1,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          {/* Editor */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 p-4 font-mono text-sm resize-none"
            style={{
              background: "var(--bg-primary)",
              border: "none",
              outline: "none",
            }}
          />
        </div>
      ) : (
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: "var(--text-muted)" }}
        >
          Select a role
        </div>
      )}
    </div>
  );
}
