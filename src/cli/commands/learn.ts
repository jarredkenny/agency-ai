import { api } from "../lib/api.js";
import { getConfig } from "../lib/config.js";

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function removeFlagPairs(args: string[], flags: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < args.length) {
    if (flags.includes(args[i]) && i + 1 < args.length) {
      i += 2;
    } else {
      result.push(args[i]);
      i++;
    }
  }
  return result;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export default async function learn(args: string[]) {
  const tags = parseFlag(args, "--tags");
  const contentArgs = removeFlagPairs(args, ["--tags"]);
  const content = contentArgs.join(" ");
  if (!content) {
    console.error("Usage: agency learn <content...> [--tags t1,t2]");
    process.exit(1);
  }
  const { agentName } = getConfig();
  const key = slugify(content);
  const from = agentName || "human";
  const row = await api("/knowledge", {
    method: "POST",
    body: JSON.stringify({
      key, content, from,
      tags: tags ? tags.split(",") : [],
    }),
  });
  console.log(`Learned: ${row.key} (${row.tags?.join(", ") || "no tags"})`);
}
