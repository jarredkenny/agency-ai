import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { requireAgencyRoot } from "../lib/find-root.js";

export default async function daemon(args: string[]) {
  const sub = args[0];
  if (!sub) {
    console.error("Usage: agency daemon <install|uninstall|start|stop|status|logs|run>");
    process.exit(1);
  }

  // "run" is special — it starts the daemon in-process (what systemd/launchd actually calls)
  if (sub === "run") {
    const agencyRoot = requireAgencyRoot();
    process.env.DATABASE_PATH = path.join(agencyRoot, "agency.db");
    process.env.FLEET_PATH = path.join(agencyRoot, "fleet.json");
    await import("../../daemon.js");
    return;
  }

  const { execSync } = await import("child_process");
  const agencyRoot = requireAgencyRoot();
  const projectDir = path.dirname(agencyRoot); // parent of .agency/
  const bunPath = process.argv[0] || "bun";
  const serviceName = "agency";
  const isMac = process.platform === "darwin";

  // Resolve the path to daemon entry point
  // When installed as npm package, it's relative to the package
  const daemonScript = path.resolve(import.meta.dir, "../../daemon.ts");

  if (isMac) {
    const label = "com.agency.daemon";
    const plistDir = path.join(os.homedir(), "Library/LaunchAgents");
    const plistFile = path.join(plistDir, `${label}.plist`);
    const logDir = path.join(os.homedir(), "Library/Logs/agency");
    const uid = process.getuid?.() ?? 501;
    const domain = `gui/${uid}`;

    if (sub === "install") {
      fs.mkdirSync(plistDir, { recursive: true });
      fs.mkdirSync(logDir, { recursive: true });
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bunPath}</string>
    <string>${daemonScript}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectDir}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${process.env.PATH}</string>
    <key>HOME</key>
    <string>${os.homedir()}</string>
    <key>DATABASE_PATH</key>
    <string>${path.join(agencyRoot, "agency.db")}</string>
    <key>FLEET_PATH</key>
    <string>${path.join(agencyRoot, "fleet.json")}</string>
  </dict>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${logDir}/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${logDir}/stderr.log</string>
</dict>
</plist>`;
      fs.writeFileSync(plistFile, plist);
      console.log(`Installed ${plistFile}`);
      return;
    }
    if (sub === "uninstall") {
      try { execSync(`launchctl bootout ${domain}/${label}`, { stdio: "inherit" }); } catch {}
      try { fs.unlinkSync(plistFile); } catch {}
      console.log("Uninstalled agency service.");
      return;
    }
    if (sub === "start") {
      try { execSync(`launchctl bootstrap ${domain} ${plistFile}`, { stdio: "inherit" }); } catch {
        try { execSync(`launchctl kickstart ${domain}/${label}`, { stdio: "inherit" }); } catch {}
      }
      console.log("Started agency daemon.");
      return;
    }
    if (sub === "stop") {
      try { execSync(`launchctl kill SIGTERM ${domain}/${label}`, { stdio: "inherit" }); } catch {}
      console.log("Stopped agency daemon.");
      return;
    }
    if (sub === "status") {
      try { execSync(`launchctl print ${domain}/${label}`, { stdio: "inherit" }); } catch {
        console.log("Service not loaded.");
      }
      return;
    }
    if (sub === "logs") {
      try { execSync(`tail -f ${logDir}/stdout.log ${logDir}/stderr.log`, { stdio: "inherit" }); } catch {}
      return;
    }
  } else {
    // Linux — systemd
    const serviceDir = path.join(os.homedir(), ".config/systemd/user");
    const serviceFile = path.join(serviceDir, `${serviceName}.service`);

    if (sub === "install") {
      const unit = `[Unit]
Description=Agency Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=${projectDir}
ExecStart=${bunPath} ${daemonScript}
Restart=on-failure
RestartSec=5
Environment="PATH=${process.env.PATH}"
Environment="HOME=${os.homedir()}"
Environment="DATABASE_PATH=${path.join(agencyRoot, "agency.db")}"
Environment="FLEET_PATH=${path.join(agencyRoot, "fleet.json")}"

[Install]
WantedBy=default.target
`;
      fs.mkdirSync(serviceDir, { recursive: true });
      fs.writeFileSync(serviceFile, unit);
      execSync("systemctl --user daemon-reload");
      execSync(`systemctl --user enable ${serviceName}`);
      console.log(`Installed and enabled ${serviceFile}`);
      return;
    }
    if (sub === "uninstall") {
      try { execSync(`systemctl --user stop ${serviceName}`, { stdio: "inherit" }); } catch {}
      try { execSync(`systemctl --user disable ${serviceName}`, { stdio: "inherit" }); } catch {}
      try { fs.unlinkSync(serviceFile); } catch {}
      execSync("systemctl --user daemon-reload");
      console.log("Uninstalled agency service.");
      return;
    }
    if (sub === "start") {
      execSync(`systemctl --user start ${serviceName}`, { stdio: "inherit" });
      console.log("Started agency daemon.");
      return;
    }
    if (sub === "stop") {
      execSync(`systemctl --user stop ${serviceName}`, { stdio: "inherit" });
      console.log("Stopped agency daemon.");
      return;
    }
    if (sub === "status") {
      try { execSync(`systemctl --user status ${serviceName}`, { stdio: "inherit" }); } catch {}
      return;
    }
    if (sub === "logs") {
      try { execSync(`journalctl --user -u ${serviceName} -f`, { stdio: "inherit" }); } catch {}
      return;
    }
  }

  console.error("Unknown daemon subcommand:", sub);
  console.log("Subcommands: install, uninstall, start, stop, status, logs, run");
  process.exit(1);
}
