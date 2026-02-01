# Agency — Multi-Agent AI Development Platform

A scalable orchestrator + worker architecture for autonomous AI software development. Agents coordinate through a central API, communicate via task comments, and execute work through Claude Code sessions.

```
                         ┌──────────────┐
                         │    Human     │
                         │  (dashboard) │
                         └──────┬───────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │     Orchestrator      │
                    │                       │
                    │  Investigates → Plans  │
                    │  Creates tasks → Delegates
                    └───────────┬───────────┘
                                │ Tasks (via API)
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ Worker A │ │ Worker B │ │ Worker C │
              │          │ │          │ │          │
              │ Claims → │ │          │ │          │
              │ Codes  → │ │   ...    │ │   ...    │
              │ Ships    │ │          │ │          │
              └──────────┘ └──────────┘ └──────────┘
```

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

Dashboard at `http://localhost:3001`, API at `http://localhost:3100`.

## Stack

| Component | Tech | Port |
|-----------|------|------|
| **API** | Hono + Kysely + SQLite (Bun) | 3100 |
| **Dashboard** | Next.js 15 + React 19 + Tailwind 4 | 3001 |
| **CLI** | TypeScript (Bun) | — |

## Project Structure

```
@jx0/agency
├── bin/agency.js              # CLI entry point (#!/usr/bin/env bun)
├── src/
│   ├── cli/
│   │   ├── index.ts           # Command dispatcher
│   │   ├── commands/          # One file per command
│   │   │   ├── init.ts        # Interactive project setup
│   │   │   ├── ps.ts          # List agents
│   │   │   ├── start.ts       # Start agent
│   │   │   ├── stop.ts        # Stop agent
│   │   │   ├── logs.ts        # Tail agent logs
│   │   │   ├── ssh.ts         # SSH into agent
│   │   │   ├── tasks.ts       # Task CRUD
│   │   │   ├── msg.ts         # Task comments
│   │   │   ├── learn.ts       # Store knowledge
│   │   │   ├── recall.ts      # Search knowledge
│   │   │   ├── doc.ts         # Documents
│   │   │   ├── daemon.ts      # Service management
│   │   │   ├── status.ts      # Health check
│   │   │   ├── config.ts      # Settings
│   │   │   └── skills.ts      # Skills CRUD
│   │   └── lib/
│   │       ├── find-root.ts   # Walk up to find .agency/
│   │       ├── api.ts         # HTTP client
│   │       ├── config.ts      # CLI config
│   │       └── prompt.ts      # Interactive prompts
│   ├── api/
│   │   ├── index.ts           # Hono app
│   │   ├── routes/            # REST endpoints
│   │   │   ├── agents.ts
│   │   │   ├── tasks.ts
│   │   │   ├── messages.ts
│   │   │   ├── notifications.ts
│   │   │   ├── activities.ts
│   │   │   ├── documents.ts
│   │   │   ├── knowledge.ts
│   │   │   ├── settings.ts
│   │   │   ├── skills.ts
│   │   │   └── role-configs.ts
│   │   ├── db/
│   │   │   ├── client.ts      # SQLite via Kysely
│   │   │   ├── types.ts
│   │   │   ├── migrate.ts
│   │   │   ├── seed.ts
│   │   │   └── migrations/
│   │   │       ├── 001_initial.ts
│   │   │       └── 002_configs.ts
│   │   └── lib/
│   │       ├── activity.ts
│   │       ├── fleet-sync.ts
│   │       ├── mentions.ts
│   │       ├── processes.ts
│   │       └── resolve-agent.ts
│   ├── daemon.ts              # Starts API + dashboard
│   └── templates/             # Defaults seeded on init
│       ├── soul.md
│       ├── user.md
│       ├── memory.md
│       ├── heartbeat-orchestrator.md
│       ├── heartbeat-implementer.md
│       ├── agents-config-orchestrator.md
│       ├── agents-config-implementer.md
│       ├── tools-orchestrator.md
│       ├── tools-implementer.md
│       ├── agents-orchestrator.md
│       ├── agents-implementer.md
│       └── environment.md
├── dashboard/                 # Next.js app (output: standalone)
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/api.ts
└── package.json               # @jx0/agency
```

## `.agency/` Directory

Created by `agency init`. This is the only directory Agency writes to in your project:

```
.agency/
├── agency.db       # SQLite database (all state)
└── fleet.json      # Agent fleet config
```

Everything else — settings, skills, role configs — lives in the database, editable via the dashboard or CLI.

## CLI Reference

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
- **Settings** — Key-value editor grouped by category (General, Slack, AWS, SSH)
- **Skills** — Markdown editor for team skills
- **Roles** — Markdown editor for role configs (Heartbeat, Tools, Agents, etc.)

## How It Works

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
