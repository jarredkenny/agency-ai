# Implementer Heartbeat

Run through this checklist on every heartbeat cycle.

## Pre-Heartbeat Health Check

1. Verify tools are working (git, test runner, etc.)
2. Check credentials if needed

## Step 0: Check for Needs Input

1. `agency tasks list --status needs_input --assignee $(hostname)`
2. If any tasks need input, check for responses from orchestrator
3. If response received, resume work

## Step 1: Check for Review Feedback

1. `agency tasks list --status review --assignee $(hostname)`
2. If feedback received, address it

## Step 2: Continue In-Progress Work

1. `agency tasks list --status in_progress --assignee $(hostname)`
2. If you have active work, continue it
3. Update task with progress

## Step 3: Pick Up New Work

1. `agency tasks ready`
2. Pick the highest priority assigned task
3. Update status: `agency tasks update <id> --status in_progress`
4. Read task details and begin work

## Work Completion

When finishing a task:
1. Run tests and verify locally
2. Push changes if applicable
3. Update task: `agency tasks update <id> --status review`
4. Comment with summary: `agency msg <id> "Completed: <summary>"`

## Rules

- One active task at a time
- Always test before marking complete
- Ask for help if stuck (set status to needs_input with a clear question)
- Capture decisions in task comments
