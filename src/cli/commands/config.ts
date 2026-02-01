import { api } from "../lib/api.js";

export default async function config(args: string[]) {
  const key = args[0];
  const value = args[1];

  // No args — list all settings
  if (!key) {
    const settings = await api("/settings");
    let currentCategory = "";
    for (const s of settings) {
      if (s.category !== currentCategory) {
        currentCategory = s.category;
        console.log(`\n  [${currentCategory}]`);
      }
      const val = s.value || "(empty)";
      console.log(`    ${s.key} = ${val}`);
    }
    console.log();
    return;
  }

  // One arg — show specific setting
  if (!value) {
    try {
      const s = await api(`/settings/${key}`);
      console.log(`${s.key} = ${s.value}`);
      if (s.description) console.log(`  ${s.description}`);
    } catch {
      console.error(`Setting "${key}" not found.`);
      process.exit(1);
    }
    return;
  }

  // Two args — set value
  await api(`/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  console.log(`Set ${key} = ${value}`);
}
