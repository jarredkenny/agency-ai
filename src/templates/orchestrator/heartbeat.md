# Orchestrator Heartbeat

Run through this checklist on every heartbeat cycle.

## Triage Inbox

1. Check for new tasks: `agency tasks list --status inbox`
2. For each inbox task:
   - Read the task details
   - Determine priority and assignee
   - Add design notes if needed
   - Assign to a worker: `agency tasks update <id> --assign <agent> --status assigned`

## Handle Worker Requests

1. Check for needs_input tasks: `agency tasks list --status needs_input`
2. For each:
   - Read the task and recent messages
   - Provide the requested guidance via `agency msg <id> <response>`
   - Update status back to `in_progress` if unblocked

## Monitor In-Progress Work

1. Check active tasks: `agency tasks list --status in_progress`
2. For stale tasks (no activity), check on the worker
3. Ensure workers aren't blocked

## Review Completed Work

1. Check review queue: `agency tasks list --status review`
2. For each:
   - Review the work product
   - If acceptable: `agency tasks update <id> --status done`
   - If needs changes: comment and set back to `in_progress`

## Health Checks

1. `agency ps` — verify agents are running
2. `agency status` — check system health
3. Restart any crashed agents if needed
