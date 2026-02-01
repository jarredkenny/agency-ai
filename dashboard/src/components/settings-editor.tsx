"use client";

import { useEffect, useState } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface Setting {
  key: string;
  value: string;
  category: string;
  description: string | null;
}

const CATEGORIES = ["general", "slack", "aws", "ssh"];

export function SettingsEditor() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [activeCategory, setActiveCategory] = useState("general");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/settings").then(setSettings).catch(console.error);
  }, []);

  const filtered = settings.filter((s) => s.category === activeCategory);

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      await mutateApi(`/settings/${key}`, "PUT", { value: edits[key] ?? "" });
      setSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value: edits[key] ?? "" } : s))
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Category sidebar */}
      <div
        className="w-[200px] shrink-0 overflow-y-auto border-r"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div
          className="px-4 py-3 text-xs font-bold tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          CATEGORIES
        </div>
        <div className="space-y-0.5 px-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: activeCategory === cat ? "var(--bg-tertiary)" : "transparent",
                color: activeCategory === cat ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Settings list */}
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold mb-4">
          {activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)} Settings
        </h2>
        <div className="space-y-4 max-w-xl">
          {filtered.map((s) => {
            const currentValue = edits[s.key] ?? s.value;
            const isDirty = edits[s.key] !== undefined && edits[s.key] !== s.value;
            return (
              <div key={s.key} className="space-y-1">
                <label className="text-sm font-medium">{s.key}</label>
                {s.description && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {s.description}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type={s.key.includes("token") || s.key.includes("key_path") ? "password" : "text"}
                    value={currentValue}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-md text-sm"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                  />
                  {isDirty && (
                    <button
                      onClick={() => handleSave(s.key)}
                      disabled={saving === s.key}
                      className="px-3 py-2 rounded-md text-xs font-medium text-white"
                      style={{ background: "var(--accent-green)", opacity: saving === s.key ? 0.6 : 1 }}
                    >
                      {saving === s.key ? "Saving..." : "Save"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              No settings in this category.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
