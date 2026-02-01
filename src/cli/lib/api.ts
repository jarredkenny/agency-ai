import { getConfig } from "./config.js";

const { apiUrl } = getConfig();

export async function api(path: string, options?: RequestInit): Promise<any> {
  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}
