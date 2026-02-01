# Agency — Multi-Agent AI Development Platform

A scalable orchestrator + worker architecture for autonomous AI software development. Built on top of [OpenClaw](https://openclaw.ai/) ([GitHub](https://github.com/openclaw/openclaw)) — each deployed agent is an OpenClaw instance with full shell access, file I/O, and browser control. Agency adds the coordination layer: task assignment, inter-agent messaging, role-based configuration, and a dashboard to manage it all.

```
                         ┌──────────────┐
                         │    Human     │
                         │  (dashboard) │
                         └──────┬───────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │     Orchestrator      │
                    │    (OpenClaw agent)   │
                    │                       │
                    │  Investigates → Plans  │
                    │  Creates tasks → Delegates
                    └───────────┬───────────┘
                                │ Tasks (via API)
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ Worker A │ │ Worker B │ │ Worker C │
              │ (OpenClaw)│ │(OpenClaw)│ │(OpenClaw)│
              │          │ │          │ │          │
              │ Claims → │ │          │ │          │
              │ Codes  → │ │   ...    │ │   ...    │
              │ Ships    │ │          │ │          │
              └──────────┘ └──────────┘ └──────────┘
```

![Mission Control](https://raw.githubusercontent.com/jarredkenny/agency-ai/main/docs/images/agency_ui_mission_control.png)

## Install

```bash
# From npm
bun install -g @jx0/agency

# Or from source (always uses repo version)
git clone https://github.com/jx0/agency.git
cd agency
bun install
bun link
```

## Quick Start

```bash
# Initialize a new project
agency init

# This creates .agency/ in your current directory, runs migrations,
# seeds default settings and role configs, and optionally starts the daemon.

# Start the daemon manually if you skipped it during init
agency daemon install
agency daemon start
```

Dashboard and API both served at `http://localhost:3100`.

## Stack

| Component | Tech | Port |
|-----------|------|------|
| **API + Dashboard** | Hono + Kysely + SQLite (Bun) + Next.js static export | 3100 |
| **CLI** | TypeScript (Bun) | — |

## `.agency/` Directory

Created by `agency init`. This is the only directory Agency writes to in your project:

```
.agency/
├── agency.db       # SQLite database (all state)
└── fleet.json      # Agent fleet config
```

Everything else — settings, skills, role configs — lives in the database, editable via the dashboard or CLI.

## CLI Reference

![agency ps](https://raw.githubusercontent.com/jarredkenny/agency-ai/main/docs/images/agency_cli_ps.png)

```
agency init                          Set up .agency/ in current directory
agency ps                            List agents
agency start <name>                  Start an agent
agency stop <name>                   Stop an agent
agency logs <name>                   Tail agent logs
agency ssh <name>                    SSH into agent (EC2 only)
agency tasks create <title> [flags]  Create a task
agency tasks list [--status S]       List tasks
agency tasks ready                   Show your assigned tasks
agency tasks show <id>               Show task details
agency tasks update <id> [flags]     Update a task
agency tasks close <id>              Close a task
agency msg <task-id> <message>       Post a task comment
agency learn <content> [--tags t,t]  Store knowledge
agency recall <search>               Search knowledge
agency doc create <title> [flags]    Create a document (stdin)
agency doc show <id>                 Show a document
agency daemon install                Install as system service
agency daemon uninstall              Remove system service
agency daemon start                  Start the daemon
agency daemon stop                   Stop the daemon
agency daemon status                 Check daemon status
agency daemon logs                   Tail daemon logs
agency daemon run                    Run daemon in foreground
agency status [agent-name]           Health check
agency config                        List all settings
agency config <key>                  Show a setting
agency config <key> <value>          Set a setting
agency skills list                   List skills
agency skills show <id>              Show a skill
agency skills create <name>          Create a skill (stdin)
agency skills delete <id>            Delete a skill
agency --version                     Show version
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check |
| GET/POST | `/agents` | List/create agents |
| GET/PATCH/DELETE | `/agents/:name` | Agent CRUD |
| POST | `/agents/:name/deploy` | Start an agent |
| POST | `/agents/:name/stop` | Stop an agent |
| GET | `/agents/:name/config/:type` | Get agent's role config |
| GET/POST | `/tasks` | List/create tasks |
| GET/PATCH | `/tasks/:id` | Task details/update |
| POST | `/tasks/:id/assign` | Assign agent |
| GET/POST | `/tasks/:id/messages` | Task comments |
| GET | `/activities` | Activity feed |
| GET | `/notifications/pending/:agent` | Pending notifications |
| GET/POST | `/knowledge` | Knowledge base |
| GET/POST | `/documents` | Documents |
| GET/PUT/DELETE | `/settings` | Settings (key-value) |
| GET/POST/PUT/DELETE | `/skills` | Skills (markdown docs) |
| GET/PUT/DELETE | `/role-configs/:role/:type` | Role configuration docs |

## Database Schema

All state lives in `.agency/agency.db` (SQLite):

- **agents** — Name, role, status, location, tokens
- **tasks** — Title, description, design, acceptance, priority, status, parent
- **task_assignees** — Agent-to-task assignments
- **messages** — Task comments
- **activities** — Event log
- **notifications** — Delivery queue
- **documents** — Task-linked documents
- **knowledge** — Tagged knowledge base
- **settings** — Key-value config (grouped by category)
- **skills** — Markdown skill documents
- **role_configs** — Role configuration documents (heartbeat, tools, agents, etc.)

## Dashboard

Five views accessible from the top nav:

- **Mission Control** — Agent roster + task kanban board + live activity feed
- **Agent Config** — Browse agent workspace files (served from role_configs in DB)
- **Settings** — Categorized editor for Identity, AI Provider, AWS, and SSH configuration
- **Skills** — Markdown editor for team skills
- **Roles** — Markdown editor for role configs (Heartbeat, Tools, Agents, etc.)

![Agent Config](https://raw.githubusercontent.com/jarredkenny/agency-ai/main/docs/images/agent_ui_agent_config.png)

### Settings

Sensitive values (API keys, SSH keys, credentials) are masked in the API and revealed on demand in the UI. AI provider settings support both direct API key entry and Claude Max OAuth (import tokens from Claude Code with one click).

| | |
|---|---|
| ![Identity](https://raw.githubusercontent.com/jarredkenny/agency-ai/main/docs/images/agency_ui_identity_settings.png) | ![AI Provider](https://raw.githubusercontent.com/jarredkenny/agency-ai/main/docs/images/agency_ui_ai_prodivder_settings.png) |
| ![AWS](https://raw.githubusercontent.com/jarredkenny/agency-ai/main/docs/images/agency_ui_aws_settings.png) | |

## How It Works

### Agents

Every agent in Agency is an [OpenClaw](https://openclaw.ai/) instance. OpenClaw provides the core capabilities — shell access, file I/O, browser control, persistent memory, and multi-model support. Agency layers on top of that with:

- **Role configs** — each agent gets injected with role-specific prompts (Soul, Identity, Tools, Agents, Heartbeat) that define its behavior
- **Task coordination** — agents poll the Agency API for assigned work, post progress via task comments, and transition tasks through the workflow
- **Fleet management** — deploy agents locally (Bun subprocess), via Docker, or on EC2 with automatic SSH tunnels

Agents can run any model OpenClaw supports (Claude, GPT, local models), configured through the AI Provider settings.

### Deployment Modes

| Mode | How it works |
|------|-------------|
| **Local** | Spawns a Bun subprocess on the host machine. Agent talks to API at `localhost:3100` directly. |
| **Docker** | Runs `docker compose up` for the agent container. |
| **EC2** | Opens a reverse SSH tunnel from the remote instance back to the host, so the agent's `agency` CLI hits `localhost:3100` on the remote machine which tunnels back to the host API. |

#### EC2 Agent Setup

1. Configure SSH in Settings → SSH (paste your private key, set the username)
2. Add `host` to the agent's entry in `.agency/fleet.json`:

```json
{
  "agents": {
    "nova": { "role": "implementer", "location": "ec2", "host": "54.123.45.67" }
  }
}
```

3. Click **Deploy** in the dashboard (or `agency start nova`)

The daemon opens `ssh -R 3100:localhost:3100 user@host -N` — a persistent reverse tunnel with auto-reconnect. The remote agent's CLI commands (`agency tasks list`, `agency msg`, etc.) hit `localhost:3100` which forwards through the tunnel to the host API. No agent-side configuration needed.

On stop, the tunnel is torn down. On daemon shutdown, all tunnels are cleaned up.

You can also SSH directly into any EC2 agent:

```bash
agency ssh nova          # interactive shell
agency ssh nova ls -la   # run a command
```

### Task Lifecycle

```
inbox → assigned → in_progress → review → done
                        │
                        ▼
                    needs_input
```

1. Human or orchestrator creates a task
2. Task is assigned to a worker agent
3. Worker picks it up, does the work
4. Worker moves to review
5. Orchestrator/human reviews and closes

### Knowledge Sharing

Agents build collective knowledge through the CLI and API:

```bash
agency learn "postgres migrations need --lock-timeout 5s" --tags postgres,migrations
agency recall "postgres migrations"
```

## Development

```bash
# From repo root
bun install

# Run everything (API + dashboard)
bun run dev

# Or run just the API
DATABASE_PATH=.agency/agency.db bun run src/api/index.ts

# Run migrations
DATABASE_PATH=.agency/agency.db bun run src/api/db/migrate.ts

# Build dashboard for production
bun run build
```

## License

MIT
