import * as fs from "fs";
import * as path from "path";
import { ask, confirm } from "../lib/prompt.js";

export default async function init(_args: string[]) {
  console.log("\n  Agency — Multi-Agent AI Development Platform\n");
  console.log("  Setting up .agency/ in current directory...\n");

  const agencyDir = path.resolve(process.cwd(), ".agency");

  if (fs.existsSync(agencyDir)) {
    const proceed = await confirm(".agency/ already exists. Re-initialize?", false);
    if (!proceed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  const userName = await ask("? Your name", "Human");
  const teamName = await ask("? Team name", "My Team");
  const orchestratorName = await ask("? Orchestrator agent name", "sonny");

  const os = await import("os");
  const machineName = await ask("? Machine name for this host", os.hostname());

  const doSlack = await confirm("? Configure Slack?", false);
  let slackBotToken = "";
  let slackAppToken = "";
  let slackChannel = "";
  let slackUserId = "";
  if (doSlack) {
    slackBotToken = await ask("  ? Slack bot token");
    slackAppToken = await ask("  ? Slack app token");
    slackChannel = await ask("  ? Slack channel ID");
    slackUserId = await ask("  ? Your Slack user ID");
  }

  const workerRolesInput = await ask("? Add agents? (role:name or name, comma-separated, e.g. 'implementer:bob,solo:ace')");
  const workerAgents: { name: string; role: string }[] = [];
  if (workerRolesInput) {
    for (const entry of workerRolesInput.split(",").map((r) => r.trim()).filter(Boolean)) {
      if (entry.includes(":")) {
        const [role, name] = entry.split(":", 2);
        workerAgents.push({ name: name.trim(), role: role.trim() });
      } else {
        // Default to implementer role if no role specified
        workerAgents.push({ name: entry, role: "implementer" });
      }
    }
  }

  const allRoles = ["orchestrator", ...workerAgents.map((a) => a.role)];
  const allRoleNames = [orchestratorName, ...workerAgents.map((a) => a.name)];

  // Create .agency directory
  console.log("\n  Creating .agency/ ...");
  fs.mkdirSync(agencyDir, { recursive: true });

  // Create fleet.json
  const fleet: any = {
    agents: {
      [orchestratorName]: { role: "orchestrator", runtime: "system", machine: machineName },
    },
  };
  for (const agent of workerAgents) {
    fleet.agents[agent.name] = { role: agent.role, runtime: "system", machine: machineName };
  }
  fs.writeFileSync(
    path.join(agencyDir, "fleet.json"),
    JSON.stringify(fleet, null, 2) + "\n"
  );

  // Create machines.json with the local machine
  const machinesPath = path.join(agencyDir, "machines.json");
  fs.writeFileSync(machinesPath, JSON.stringify([
    { name: machineName, host: "localhost", user: "", port: 0, auth: "local" },
  ], null, 2) + "\n");
  console.log(`  Registered machine: ${machineName} (local)`);

  // Run migrations
  console.log("  Running migrations ...");
  process.env.DATABASE_PATH = path.join(agencyDir, "agency.db");

  const { runMigrations } = await import("../../api/db/migrate.js");
  await runMigrations();

  // Seed defaults
  console.log("  Seeding defaults ...");

  // We need to re-import db after setting DATABASE_PATH
  const { seedDefaults } = await import("../../api/db/seed.js");
  await seedDefaults({
    userName,
    teamName,
    roles: [...new Set(allRoles)],
  });

  // Store Slack settings if provided
  if (doSlack) {
    const { db } = await import("../../api/db/client.js");
    const slackSettings = [
      { key: "slack.team_channel", value: slackChannel },
      { key: "slack.human_user_id", value: slackUserId },
    ];
    for (const s of slackSettings) {
      await db.updateTable("settings").where("key", "=", s.key).set({ value: s.value, updated_at: new Date().toISOString() }).execute();
    }
  }

  console.log(`  Creating orchestrator: ${orchestratorName} ...`);
  for (const agent of workerAgents) {
    console.log(`  Creating agent: ${agent.name} (${agent.role}) ...`);
  }

  // Offer to install daemon
  const doDaemon = await confirm("\n? Install and start the daemon?", true);
  if (doDaemon) {
    const daemonMod = await import("./daemon.js");
    await daemonMod.default(["install"]);
    await daemonMod.default(["start"]);
  }

  console.log("\n  Done! Dashboard: http://localhost:3001 | API: http://localhost:3100\n");
}
