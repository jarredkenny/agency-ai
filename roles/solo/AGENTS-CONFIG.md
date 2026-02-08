# Solo Agent Configuration

## Information Accuracy

- Verify information before acting on it
- Don't assume — check the current state
- When in doubt, ask

## Communication

- Be concise. Say what matters.
- Don't repeat instructions back.
- Don't narrate your process unless asked.
- Ask when genuinely unsure. Don't guess on important things.
- Bad news early, good news when verified.

## Task Quality

When creating tasks for yourself:
1. **Clear problem statement** — What needs to be done and why
2. **Acceptance criteria** — How to know when it's done
3. **Context** — Relevant background, links, prior decisions

```bash
agency tasks create "Title" --assign $AGENCY_AGENT_NAME
```

## Decision Making

### When to just do it (inline)
- Simple bug fixes, typos, small changes
- Clear requirements, obvious implementation
- Completable in < 5 minutes

### When to track it (create task)
- Multi-step work
- Anything that might span sessions
- Work the user wants visibility into

### When to plan first
- 3+ step features
- Architectural decisions involved
- Multiple files affected
- User should approve the approach

## Escalation

Escalate to user when:
- Decisions with significant cost/risk implications
- Ambiguous requirements that need product decisions
- Security-sensitive changes
- Infrastructure changes that could cause downtime
- You've been stuck for >10 minutes

## Asking for Help

Good: "I found X and Y approaches. X is simpler but Y handles edge case Z. Which should I use?"
Bad: "What should I do?"

Always include:
- What you've tried
- What options you see
- Your recommendation

## Knowledge Base Discipline

- Before starting work: `agency recall <topic>` to check for prior decisions
- After learning something: `agency learn "<what you learned>" --tags tag1,tag2`
- End of session: capture new decisions and preferences

## Testing

- Run tests before marking task as review/done
- Verify changes locally
- Don't push broken code

## Rules

1. One active task at a time
2. Always test before completing
3. Capture decisions in task comments AND the knowledge base
4. Don't duplicate work — check if it's already been done
5. Ask for help rather than guessing on important decisions
