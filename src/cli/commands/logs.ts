import { requireAgencyRoot } from "../lib/find-root.js";
import * as path from "path";
import * as fs from "fs";

export default async function logs(args: string[]) {
  const name = args[0];
  if (!name) {
    console.error("Usage: agency logs <agent-name>");
    process.exit(1);
  }

  // For now, try to tail logs from common locations
  const agencyRoot = requireAgencyRoot();
  const logFile = path.join(agencyRoot, "logs", `${name}.log`);

  if (fs.existsSync(logFile)) {
    const proc = Bun.spawn(["tail", "-f", logFile], { stdio: ["inherit", "inherit", "inherit"] });
    await proc.exited;
  } else {
    // Try journalctl for systemd-managed agents
    try {
      const proc = Bun.spawn(["journalctl", "--user", "-u", `agency-${name}`, "-f"], {
        stdio: ["inherit", "inherit", "inherit"],
      });
      await proc.exited;
    } catch {
      console.error(`No logs found for agent "${name}".`);
      process.exit(1);
    }
  }
}
