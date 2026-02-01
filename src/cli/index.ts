const args = process.argv.slice(2);
const command = args[0];

const COMMANDS: Record<string, () => Promise<any>> = {
  init: () => import("./commands/init.js"),
  ps: () => import("./commands/ps.js"),
  start: () => import("./commands/start.js"),
  stop: () => import("./commands/stop.js"),
  logs: () => import("./commands/logs.js"),
  ssh: () => import("./commands/ssh.js"),
  tasks: () => import("./commands/tasks.js"),
  msg: () => import("./commands/msg.js"),
  learn: () => import("./commands/learn.js"),
  recall: () => import("./commands/recall.js"),
  doc: () => import("./commands/doc.js"),
  daemon: () => import("./commands/daemon.js"),
  status: () => import("./commands/status.js"),
  config: () => import("./commands/config.js"),
  skills: () => import("./commands/skills.js"),
  ping: () => import("./commands/status.js"), // alias
};

async function main() {
  if (command === "--version" || command === "-v" || command === "-V") {
    const pkg = await import("../../package.json");
    console.log(pkg.default?.version ?? pkg.version ?? "0.1.0");
    process.exit(0);
  }

  if (!command || command === "--help" || command === "-h") {
    console.log(`Agency — Multi-Agent AI Development Platform

Usage: agency <command> [args]

Commands:
  init                          Set up .agency/ in current directory
  ps                            List agents
  start <name>                  Start an agent
  stop <name>                   Stop an agent
  logs <name>                   Tail agent logs
  ssh <name>                    SSH into agent
  tasks <subcommand>            Task management (create/list/ready/show/update/close)
  msg <task-id> <message>       Post a task comment
  learn <content> [--tags t,t]  Store knowledge
  recall <search>               Search knowledge
  doc <subcommand>              Document management
  daemon <subcommand>           Daemon management (install/uninstall/start/stop/status/logs/run)
  status                        Health check
  config [key] [value]          View/edit settings
  skills <subcommand>           Skills management (list/show/create/update/delete)`);
    process.exit(0);
  }

  const loader = COMMANDS[command];
  if (!loader) {
    console.error(`Unknown command: ${command}`);
    console.error("Run 'agency --help' for usage.");
    process.exit(1);
  }

  const mod = await loader();
  if (mod.default) {
    await mod.default(args.slice(1));
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
