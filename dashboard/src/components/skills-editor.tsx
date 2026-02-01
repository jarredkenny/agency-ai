"use client";

import { useEffect, useState } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface Skill {
  id: string;
  name: string;
  body: string;
  category: string;
  tags: string[];
}

export function SkillsEditor() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetchApi(`/skills${params}`).then(setSkills).catch(console.error);
  };

  useEffect(() => {
    loadSkills();
  }, [search]);

  const selected = skills.find((s) => s.id === selectedId);

  useEffect(() => {
    if (selected) {
      setBody(selected.body);
    }
  }, [selectedId]);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await mutateApi(`/skills/${selectedId}`, "PUT", { body });
      setSkills((prev) => prev.map((s) => (s.id === selectedId ? { ...s, body } : s)));
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const s = await mutateApi("/skills", "POST", { name: newName, body: `# ${newName}\n` });
      setSkills((prev) => [...prev, s]);
      setSelectedId(s.id);
      setNewName("");
      setCreating(false);
    } catch (err: any) {
      console.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await mutateApi(`/skills/${id}`, "DELETE");
      setSkills((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setBody("");
      }
    } catch (err: any) {
      console.error(err.message);
    }
  };

  const isDirty = selected && body !== selected.body;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Skill list sidebar */}
      <div
        className="w-[260px] shrink-0 overflow-y-auto border-r flex flex-col"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
            SKILLS
          </span>
          <button
            onClick={() => setCreating(true)}
            className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            +
          </button>
        </div>
        <div className="px-3 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="w-full px-2 py-1.5 rounded text-xs"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
          />
        </div>
        {creating && (
          <div className="px-3 pb-2 flex gap-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Skill name"
              className="flex-1 px-2 py-1.5 rounded text-xs"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <button
              onClick={handleCreate}
              className="px-2 py-1.5 rounded text-xs font-medium text-white"
              style={{ background: "var(--accent-green)" }}
            >
              Add
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto space-y-0.5 px-2">
          {skills.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between group"
            >
              <button
                onClick={() => setSelectedId(s.id)}
                className="flex-1 text-left px-2 py-2 rounded-md text-sm transition-colors"
                style={{
                  background: selectedId === s.id ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                <div className="font-medium truncate">{s.name}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {s.category}{s.tags.length ? ` · ${s.tags.join(", ")}` : ""}
                </div>
              </button>
              <button
                onClick={() => handleDelete(s.id)}
                className="opacity-0 group-hover:opacity-100 px-1 text-xs"
                style={{ color: "var(--accent-red)" }}
                title="Delete"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <span className="font-semibold">{selected.name}</span>
                <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                  {selected.category}
                </span>
              </div>
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
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="flex-1 p-4 font-mono text-sm resize-none"
              style={{
                background: "var(--bg-primary)",
                border: "none",
                outline: "none",
              }}
            />
          </>
        ) : (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            Select a skill to edit
          </div>
        )}
      </div>
    </div>
  );
}
