"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi, mutateApi } from "@/lib/api";

interface Setting {
  key: string;
  value: string;
  category: string;
  description: string | null;
  sensitive: number;
  input_type: string;
}

const MASKED = "********";

const CATEGORIES = [
  { id: "identity", label: "Identity" },
  { id: "ai", label: "AI Provider" },
  { id: "aws", label: "AWS" },
  { id: "ssh", label: "SSH" },
];

// Keys managed by the OAuth card — hidden from the normal list
const OAUTH_MANAGED_KEYS = new Set([
  "ai.oauth_access_token",
  "ai.oauth_refresh_token",
  "ai.oauth_expires_at",
  "ai.oauth_subscription_type",
  "ai.auth_method",
]);

export function SettingsEditor() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [activeCategory, setActiveCategory] = useState("identity");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [authMethod, setAuthMethod] = useState<"api_key" | "oauth">("api_key");

  const reload = useCallback(() => {
    fetchApi("/settings").then((rows: Setting[]) => {
      setSettings(rows);
      const method = rows.find((s) => s.key === "ai.auth_method");
      if (method?.value && method.value !== MASKED) {
        setAuthMethod(method.value as "api_key" | "oauth");
      }
    }).catch(console.error);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = settings.filter((s) => s.category === activeCategory);

  const handleSave = async (key: string) => {
    const val = edits[key];
    if (val === undefined) return;
    setSaving(key);
    try {
      await mutateApi(`/settings/${key}`, "PUT", { value: val });
      // Reload to get masked values back
      reload();
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

  const handleAuthMethodChange = async (method: "api_key" | "oauth") => {
    setAuthMethod(method);
    await mutateApi("/settings/ai.auth_method", "PUT", { value: method });
    reload();
  };

  const [oauthError, setOauthError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleOAuthImport = async () => {
    setImporting(true);
    setOauthError(null);
    try {
      const res = await mutateApi("/oauth/claude/import", "POST");
      if (res.ok) {
        setAuthMethod("oauth");
        reload();
      }
    } catch (err: any) {
      setOauthError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleOAuthConnect = async () => {
    setOauthError(null);
    try {
      const data = await fetchApi("/oauth/claude/authorize");
      if (data.error) {
        setOauthError(data.error);
        return;
      }
      if (data.url) {
        window.open(data.url, "claude-oauth", "width=600,height=700");
        const interval = setInterval(() => {
          fetchApi("/settings?category=ai").then((rows: Setting[]) => {
            const token = rows.find((r) => r.key === "ai.oauth_access_token");
            if (token && token.value === MASKED) {
              clearInterval(interval);
              reload();
            }
          });
        }, 2000);
        setTimeout(() => clearInterval(interval), 120000);
      }
    } catch (err: any) {
      setOauthError(err.message);
    }
  };

  const handleOAuthDisconnect = async () => {
    for (const key of ["ai.oauth_access_token", "ai.oauth_refresh_token", "ai.oauth_expires_at", "ai.oauth_subscription_type"]) {
      await mutateApi(`/settings/${key}`, "PUT", { value: "" });
    }
    await mutateApi("/settings/ai.auth_method", "PUT", { value: "api_key" });
    setAuthMethod("api_key");
    reload();
  };

  const toggleReveal = (key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderInput = (s: Setting) => {
    const isEditing = edits[s.key] !== undefined;
    const currentValue = edits[s.key] ?? s.value;
    const isDirty = isEditing && edits[s.key] !== s.value;

    if (s.input_type === "readonly") {
      return (
        <span className="text-sm px-3 py-2 block" style={{ color: "var(--text-secondary)" }}>
          {s.value || "—"}
        </span>
      );
    }

    if (s.input_type === "textarea") {
      return (
        <div className="space-y-2">
          <textarea
            value={currentValue}
            onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
            placeholder={s.sensitive ? "Paste your private key" : ""}
            rows={8}
            className="w-full px-3 py-2 rounded-md text-sm font-mono"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", resize: "vertical" }}
          />
          {isDirty && <SaveButton keyName={s.key} saving={saving} onSave={handleSave} />}
        </div>
      );
    }

    if (s.input_type === "password") {
      const isRevealed = revealed.has(s.key);
      return (
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={isRevealed ? "text" : "password"}
              value={currentValue}
              onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
              onFocus={() => {
                if (!isEditing && s.value === MASKED) {
                  setEdits((prev) => ({ ...prev, [s.key]: "" }));
                }
              }}
              placeholder={s.value === MASKED ? "••••••••" : ""}
              className="w-full px-3 py-2 rounded-md text-sm pr-10"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            />
            <button
              type="button"
              onClick={() => toggleReveal(s.key)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-1"
              style={{ color: "var(--text-muted)" }}
            >
              {isRevealed ? "Hide" : "Show"}
            </button>
          </div>
          {isDirty && <SaveButton keyName={s.key} saving={saving} onSave={handleSave} />}
        </div>
      );
    }

    // Default: text
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={currentValue}
          onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
          className="flex-1 px-3 py-2 rounded-md text-sm"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        />
        {isDirty && <SaveButton keyName={s.key} saving={saving} onSave={handleSave} />}
      </div>
    );
  };

  const renderAICategory = () => {
    const apiKeySetting = filtered.find((s) => s.key === "ai.anthropic_api_key");
    const oauthToken = settings.find((s) => s.key === "ai.oauth_access_token");
    const oauthExpiry = settings.find((s) => s.key === "ai.oauth_expires_at");
    const oauthSub = settings.find((s) => s.key === "ai.oauth_subscription_type");
    const isConnected = oauthToken?.value === MASKED;
    const isExpired = oauthExpiry?.value ? new Date(oauthExpiry.value) < new Date() : false;

    return (
      <div className="space-y-6 max-w-xl">
        {/* Auth method toggle */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Authentication Method</label>
          <div className="flex gap-2">
            <button
              onClick={() => handleAuthMethodChange("api_key")}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: authMethod === "api_key" ? "var(--accent-blue)" : "var(--bg-secondary)",
                color: authMethod === "api_key" ? "white" : "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              API Key
            </button>
            <button
              onClick={() => handleAuthMethodChange("oauth")}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: authMethod === "oauth" ? "var(--accent-blue)" : "var(--bg-secondary)",
                color: authMethod === "oauth" ? "white" : "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Claude Max OAuth
            </button>
          </div>
        </div>

        {authMethod === "api_key" && apiKeySetting && (
          <div className="space-y-1">
            <label className="text-sm font-medium">{apiKeySetting.key}</label>
            {apiKeySetting.description && (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{apiKeySetting.description}</div>
            )}
            {renderInput(apiKeySetting)}
          </div>
        )}

        {authMethod === "oauth" && (
          <div
            className="rounded-lg p-4 space-y-3"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <div className="text-sm font-medium">Claude OAuth Status</div>
            {oauthError && (
              <div className="text-sm px-3 py-2 rounded-md" style={{ background: "rgba(255,0,0,0.1)", color: "var(--accent-red, #ef4444)" }}>
                {oauthError}
              </div>
            )}
            {!isConnected && (
              <>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>Not connected</div>
                <div className="flex gap-2">
                  <button
                    onClick={handleOAuthImport}
                    disabled={importing}
                    className="px-4 py-2 rounded-md text-sm font-medium text-white"
                    style={{ background: "var(--accent-blue)", opacity: importing ? 0.6 : 1 }}
                  >
                    {importing ? "Importing..." : "Import from Claude Code"}
                  </button>
                  <button
                    onClick={handleOAuthConnect}
                    className="px-4 py-2 rounded-md text-sm font-medium"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  >
                    Connect with OAuth
                  </button>
                </div>
              </>
            )}
            {isConnected && !isExpired && (
              <>
                <div className="text-sm" style={{ color: "var(--accent-green)" }}>Connected</div>
                {oauthSub?.value && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Subscription: {oauthSub.value}
                  </div>
                )}
                {oauthExpiry?.value && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Expires: {new Date(oauthExpiry.value).toLocaleString()}
                  </div>
                )}
                <button
                  onClick={handleOAuthDisconnect}
                  className="px-3 py-1.5 rounded-md text-xs font-medium"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                >
                  Disconnect
                </button>
              </>
            )}
            {isConnected && isExpired && (
              <>
                <div className="text-sm" style={{ color: "var(--accent-yellow, orange)" }}>Token expired</div>
                <button
                  onClick={handleOAuthConnect}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white"
                  style={{ background: "var(--accent-blue)" }}
                >
                  Reconnect
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // For AI category, use special rendering
  const renderSettings = () => {
    if (activeCategory === "ai") return renderAICategory();

    const visibleSettings = filtered.filter((s) => !OAUTH_MANAGED_KEYS.has(s.key));

    return (
      <div className="space-y-4 max-w-xl">
        {visibleSettings.map((s) => (
          <div key={s.key} className="space-y-1">
            <label className="text-sm font-medium">{s.key}</label>
            {s.description && (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{s.description}</div>
            )}
            {renderInput(s)}
          </div>
        ))}
        {visibleSettings.length === 0 && (
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            No settings in this category.
          </div>
        )}
      </div>
    );
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
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: activeCategory === cat.id ? "var(--bg-tertiary)" : "transparent",
                color: activeCategory === cat.id ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Settings list */}
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold mb-4">
          {CATEGORIES.find((c) => c.id === activeCategory)?.label} Settings
        </h2>
        {renderSettings()}
      </div>
    </div>
  );
}

function SaveButton({ keyName, saving, onSave }: { keyName: string; saving: string | null; onSave: (key: string) => void }) {
  return (
    <button
      onClick={() => onSave(keyName)}
      disabled={saving === keyName}
      className="px-3 py-2 rounded-md text-xs font-medium text-white shrink-0"
      style={{ background: "var(--accent-green)", opacity: saving === keyName ? 0.6 : 1 }}
    >
      {saving === keyName ? "Saving..." : "Save"}
    </button>
  );
}
