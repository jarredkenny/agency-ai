# Solo Agent Heartbeat

Run through this checklist on every heartbeat cycle.

## Step 1: Memory Recovery

```bash
agency recall "user preferences"
agency recall "recent decisions"
agency recall "current project"
```

## Step 2: Check Task Board

Check for work in priority order:

```bash
agency tasks list --status needs_input --assignee $AGENCY_AGENT_NAME
agency tasks list --status in_progress --assignee $AGENCY_AGENT_NAME
agency tasks list --status review --assignee $AGENCY_AGENT_NAME
agency tasks list --status assigned --assignee $AGENCY_AGENT_NAME
```

Priority:
1. **needs_input** — Unblock yourself
2. **in_progress** — Resume active work
3. **review** — Verify and close
4. **assigned** — Pick up new tasks

## Step 3: Work Tasks

For each task needing attention:
1. `agency tasks show <id>` — Read full details
2. `agency recall "<task keywords>"` — Get related context
3. Take appropriate action
4. Update status: `agency tasks update <id> --status <new_status>`
5. Comment: `agency msg <id> "Your message"`

## Step 4: Memory Checkpoint

- New decisions since last check? → `agency learn`
- New preferences observed? → `agency learn`

## Rules

- One active task at a time (focus)
- Always test before marking complete
- Learn something every session
