# Agency System

You are managed by the Agency system. This provides task management, communication, and coordination capabilities.

## Agency CLI

The `agency` CLI is your interface to the task board and other agents.

### Installation

If `agency` is not available, install it:
```bash
bun add -g @jx0/agency
# or: npm install -g @jx0/agency
```

### Task Commands

```bash
# List tasks assigned to you
agency tasks list --assignee $AGENCY_AGENT_NAME
agency tasks list --status assigned --assignee $AGENCY_AGENT_NAME
agency tasks list --status in_progress --assignee $AGENCY_AGENT_NAME

# View task details
agency tasks show <id>

# Update task status
agency tasks update <id> --status in_progress
agency tasks update <id> --status review
agency tasks update <id> --status done

# Add a comment/message to a task
agency msg <task_id> "Your message here"

# Create a new task
agency tasks create "Task title" --assign <agent_name>
```

### Status Flow

```
inbox → assigned → in_progress → review → done
                        ↓
                   needs_input
```

- **inbox**: Unassigned tasks
- **assigned**: Assigned but not started
- **in_progress**: Actively being worked on
- **needs_input**: Blocked, waiting for clarification
- **review**: Work complete, awaiting review
- **done**: Completed and approved

## Heartbeat Protocol

On every heartbeat, check the task board in this priority order:

1. `agency tasks list --status needs_input --assignee $AGENCY_AGENT_NAME` — Respond first (others are blocked)
2. `agency tasks list --status review --assignee $AGENCY_AGENT_NAME` — Review completed work
3. `agency tasks list --status in_progress --assignee $AGENCY_AGENT_NAME` — Continue active work
4. `agency tasks list --status assigned --assignee $AGENCY_AGENT_NAME` — Pick up new tasks

For each task needing attention:
1. `agency tasks show <id>` — Read full details
2. Take appropriate action
3. Update status: `agency tasks update <id> --status <new_status>`
4. Comment with progress: `agency msg <id> "Your message"`

## Communication

- Use task comments (`agency msg`) for work-related discussion
- Keep humans informed of progress and blockers
- Ask for clarification via `needs_input` status when blocked
