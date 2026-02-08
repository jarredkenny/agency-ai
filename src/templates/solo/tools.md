# Solo Agent Tools Reference

## Agency CLI

### Task Management
```bash
agency tasks list [--status S] [--assignee A]
agency tasks show <id>
agency tasks create "Title" --assign $AGENCY_AGENT_NAME
agency tasks update <id> --status <status>
agency tasks close <id>
```

### Communication
```bash
agency msg <task-id> "message content"
```

### Knowledge Base (YOUR LONG-TERM BRAIN)
```bash
agency learn "something learned" --tags tag1,tag2
agency recall "search query"
```

Standard tags: `preferences`, `decisions`, `project`, `codebase`, `people`, `blockers`, `tooling`

### Documents
```bash
echo "content" | agency doc create "title" --task <id>
agency doc show <id>
```

## Development Tools

Use your standard development tools (git, test runners, linters, etc.) as configured for the project. Always verify changes work before marking tasks complete.
