"use client";

import { useEffect, useState } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface Document {
  id: string;
  title: string;
  content: string;
  doc_type: string;
  created_at: string;
}

export function DocumentsEditor() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [docType, setDocType] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const loadDocs = () => {
    fetchApi("/documents").then(setDocs).catch(console.error);
  };

  useEffect(() => { loadDocs(); }, []);

  const selected = docs.find((d) => d.id === selectedId);

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setContent(selected.content);
      setDocType(selected.doc_type);
    }
  }, [selectedId]);

  const isDirty = selected && (
    title !== selected.title || content !== selected.content || docType !== selected.doc_type
  );

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const updated = await mutateApi(`/documents/${selectedId}`, "PUT", {
        title,
        content,
        doc_type: docType,
      });
      setDocs((prev) => prev.map((d) => (d.id === selectedId ? updated : d)));
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const doc = await mutateApi("/documents", "POST", {
        title: newTitle,
        content: "",
        doc_type: "general",
        from: "human",
      });
      setDocs((prev) => [doc, ...prev]);
      setSelectedId(doc.id);
      setNewTitle("");
      setCreating(false);
    } catch (err: any) {
      console.error(err.message);
    }
  };

  const fmtDate = (s: string) => {
    try { return new Date(s).toLocaleDateString(); } catch { return s; }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className="w-[260px] shrink-0 overflow-y-auto border-r flex flex-col"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
            DOCUMENTS
          </span>
          <button
            onClick={() => setCreating(true)}
            className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            +
          </button>
        </div>
        {creating && (
          <div className="px-3 pb-2 flex gap-1">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Document title"
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
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between group">
              <button
                onClick={() => setSelectedId(d.id)}
                className="flex-1 text-left px-2 py-2 rounded-md text-sm transition-colors"
                style={{
                  background: selectedId === d.id ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                <div className="font-medium truncate">{d.title}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {d.doc_type} · {fmtDate(d.created_at)}
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
              <span className="font-semibold">{selected.title}</span>
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
            <div className="px-4 pt-3 pb-2 flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs mt-1"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Type</label>
                <input
                  type="text"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs mt-1"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                />
              </div>
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
            Select a document to edit
          </div>
        )}
      </div>
    </div>
  );
}
