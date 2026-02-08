# TOOLS.md - Solo Agent Tools

Skills define *how* tools work. This file is for *your* specifics — the stuff unique to your setup.

## Agency CLI

### Memory (YOUR LONG-TERM BRAIN)

#### Learning
```bash
agency learn "<fact>" --tags tag1,tag2
```

Standard tags:
- `preferences` — How the user likes to work
- `decisions` — Technical/architectural choices
- `project` — Project names, goals, context
- `codebase` — Patterns, conventions, file locations
- `people` — Names, roles, ownership
- `blockers` — Known issues, workarounds
- `tooling` — Build tools, CI, deployment

#### Recalling
```bash
agency recall "<search terms>"
```

### Task Management

```bash
# View tasks
agency tasks list --assignee $AGENCY_AGENT_NAME
agency tasks list --status in_progress --assignee $AGENCY_AGENT_NAME
agency tasks list --status assigned --assignee $AGENCY_AGENT_NAME
agency tasks show <id>

# Create tasks (for tracked work — assign to yourself)
agency tasks create "Task title" --assign $AGENCY_AGENT_NAME

# Update task status
agency tasks update <id> --status in_progress
agency tasks update <id> --status review
agency tasks update <id> --status done

# Task comments (progress updates)
agency msg <task-id> "Your message here"
```

### Documents
```bash
echo "content" | agency doc create "title" --task <id>
agency doc show <id>
```

## Development Tools

Use your standard development tools (git, test runners, linters, etc.) as configured for the project. Always verify changes work before marking tasks complete.

## What Goes Here

Add environment-specific notes as you discover them:
- SSH hosts and aliases
- Project-specific tooling
- Preferred voices for TTS
- Device nicknames
- Anything environment-specific

---

Add whatever helps you do your job. This is your cheat sheet.
