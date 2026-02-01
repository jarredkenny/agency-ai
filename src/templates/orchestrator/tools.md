# Orchestrator Tools Reference

## Agency CLI

### Task Management
```bash
agency tasks list [--status S] [--assignee A] [--type T]
agency tasks create "title" --description "..." [--assign agent] [--priority N]
agency tasks show <id>
agency tasks update <id> [--status S] [--priority N] [--assign agent]
agency tasks close <id>
```

### Communication
```bash
agency msg <task-id> "message content"
```

### Knowledge Base
```bash
agency learn "something learned" --tags tag1,tag2
agency recall "search query"
```

### Fleet Management
```bash
agency ps                    # List all agents
agency start <name>          # Start an agent
agency stop <name>           # Stop an agent
agency logs <name>           # Tail agent logs
agency ssh <name>            # SSH into agent
agency status                # System health check
```

### System
```bash
agency daemon status         # Check daemon status
agency daemon logs           # View daemon logs
agency config [key] [value]  # View/edit settings
```
