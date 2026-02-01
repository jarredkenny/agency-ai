import { Hono } from "hono";
import * as fs from "fs";
import * as path from "path";
import { db } from "../db/client.js";

export const oauth = new Hono();

// In-memory PKCE store (single-user system)
let pendingVerifier: string | null = null;

function base64UrlEncode(buf: ArrayBuffer): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function generateCodeVerifier(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf.buffer);
}

const CLIENT_ID = ""; // Must be configured — extract from Claude Code or set via env
const CLAUDE_CREDENTIALS_PATH = path.join(
  process.env.HOME ?? "",
  ".claude",
  ".credentials.json"
);
const REDIRECT_URI = "http://localhost:3100/oauth/claude/callback";
const AUTH_URL = "https://console.anthropic.com/oauth/authorize";
const TOKEN_URL = "https://console.anthropic.com/oauth/token";

// Import credentials from ~/.claude/.credentials.json
oauth.post("/claude/import", async (c) => {
  try {
    if (!fs.existsSync(CLAUDE_CREDENTIALS_PATH)) {
      return c.json({ error: "No Claude Code credentials found at ~/.claude/.credentials.json" }, 404);
    }
    const raw = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, "utf-8");
    const creds = JSON.parse(raw);
    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken) {
      return c.json({ error: "No OAuth tokens found in credentials file" }, 400);
    }

    const expiresAt = oauth.expiresAt
      ? new Date(oauth.expiresAt).toISOString()
      : "";

    const tokenSettings = [
      { key: "ai.oauth_access_token", value: oauth.accessToken },
      { key: "ai.oauth_refresh_token", value: oauth.refreshToken ?? "" },
      { key: "ai.oauth_expires_at", value: expiresAt },
      { key: "ai.oauth_subscription_type", value: oauth.subscriptionType ?? "" },
      { key: "ai.auth_method", value: "oauth" },
    ];

    for (const s of tokenSettings) {
      await db
        .updateTable("settings")
        .where("key", "=", s.key)
        .set({ value: s.value, updated_at: new Date().toISOString() })
        .execute();
    }

    return c.json({ ok: true, subscriptionType: oauth.subscriptionType ?? "" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Step 1: Generate authorize URL
oauth.get("/claude/authorize", async (c) => {
  const clientId = process.env.CLAUDE_OAUTH_CLIENT_ID || CLIENT_ID;
  if (!clientId) {
    return c.json({ error: "CLAUDE_OAUTH_CLIENT_ID not configured" }, 400);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  pendingVerifier = codeVerifier;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: "user:inference",
  });

  return c.json({ url: `${AUTH_URL}?${params.toString()}` });
});

// Step 2: Handle callback, exchange code for tokens
oauth.get("/claude/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    return c.html(`<html><body><p>OAuth error: ${error}</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
  }

  if (!code || !pendingVerifier) {
    return c.html(`<html><body><p>Missing code or verifier</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
  }

  const clientId = process.env.CLAUDE_OAUTH_CLIENT_ID || CLIENT_ID;
  const verifier = pendingVerifier;
  pendingVerifier = null;

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return c.html(`<html><body><p>Token exchange failed: ${err}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      subscription_type?: string;
    };

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : "";

    // Store tokens in settings
    const tokenSettings = [
      { key: "ai.oauth_access_token", value: tokens.access_token },
      { key: "ai.oauth_refresh_token", value: tokens.refresh_token ?? "" },
      { key: "ai.oauth_expires_at", value: expiresAt },
      { key: "ai.oauth_subscription_type", value: tokens.subscription_type ?? "" },
      { key: "ai.auth_method", value: "oauth" },
    ];

    for (const s of tokenSettings) {
      await db
        .updateTable("settings")
        .where("key", "=", s.key)
        .set({ value: s.value, updated_at: new Date().toISOString() })
        .execute();
    }

    return c.html(`<html><body><p>Connected successfully! This window will close.</p><script>setTimeout(()=>window.close(),1000)</script></body></html>`);
  } catch (err: any) {
    return c.html(`<html><body><p>Error: ${err.message}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
  }
});
