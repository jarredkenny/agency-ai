"use client";

import { useEffect, useState } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface KnowledgeEntry {
  id: string;
  key: string;
  content: string;
  tags: string[];
  source: string;
  created_at: string;
}

export function KnowledgeEditor() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [search, setSearch] = useState("");

  const loadEntries = () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetchApi(`/knowledge${params}`).then(setEntries).catch(console.error);
  };

  useEffect(() => { loadEntries(); }, []);
  useEffect(() => { loadEntries(); }, [search]);

  const selected = entries.find((e) => e.id === selectedId);

  useEffect(() => {
    if (selected) {
      setContent(selected.content);
      setTags(selected.tags.join(", "));
    }
  }, [selectedId]);

  const isDirty = selected && (content !== selected.content || tags !== selected.tags.join(", "));

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const updated = await mutateApi("/knowledge", "POST", {
        key: selected.key,
        content,
        tags: tagArr,
        from: "human",
      });
      setEntries((prev) => prev.map((e) => (e.id === selectedId ? updated : e)));
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newKey.trim()) return;
    try {
      const entry = await mutateApi("/knowledge", "POST", {
        key: newKey,
        content: "",
        tags: [],
        from: "human",
      });
      setEntries((prev) => [entry, ...prev]);
      setSelectedId(entry.id);
      setNewKey("");
      setCreating(false);
    } catch (err: any) {
      console.error(err.message);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className="w-[260px] shrink-0 overflow-y-auto border-r flex flex-col"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
            KNOWLEDGE
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
            placeholder="Search knowledge..."
            className="w-full px-2 py-1.5 rounded text-xs"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
          />
        </div>
        {creating && (
          <div className="px-3 pb-2 flex gap-1">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Key"
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
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between group">
              <button
                onClick={() => setSelectedId(e.id)}
                className="flex-1 text-left px-2 py-2 rounded-md text-sm transition-colors"
                style={{
                  background: selectedId === e.id ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                <div className="font-medium truncate">{e.key}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {e.tags.length ? e.tags.join(", ") : "no tags"}
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-semibold">{selected.key}</span>
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
            <div className="px-4 pt-3 pb-2">
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Tags (comma-separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs mt-1"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              />
            </div>
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
          </>
        ) : (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            Select a knowledge entry to edit
          </div>
        )}
      </div>
    </div>
  );
}
