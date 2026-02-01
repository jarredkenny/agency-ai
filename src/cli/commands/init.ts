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

  const workerRolesInput = await ask("? Add worker roles? (comma-separated names, or enter to skip)");
  const workerRoles = workerRolesInput
    ? workerRolesInput.split(",").map((r) => r.trim()).filter(Boolean)
    : [];

  const allRoles = ["orchestrator", ...workerRoles.map(() => "implementer")];
  const allRoleNames = [orchestratorName, ...workerRoles];

  // Create .agency directory
  console.log("\n  Creating .agency/ ...");
  fs.mkdirSync(agencyDir, { recursive: true });

  // Create fleet.json
  const fleet: any = {
    agents: {
      [orchestratorName]: { role: "orchestrator", location: "local" },
    },
  };
  for (const worker of workerRoles) {
    fleet.agents[worker] = { role: "implementer", location: "local" };
  }
  fs.writeFileSync(
    path.join(agencyDir, "fleet.json"),
    JSON.stringify(fleet, null, 2) + "\n"
  );

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
  for (const worker of workerRoles) {
    console.log(`  Creating worker role: ${worker} ...`);
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
