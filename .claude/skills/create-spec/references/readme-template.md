# README Template

Use this structure for the README.md at the root of each spec folder. The README serves as the orchestration index — the `implement-feature` skill reads it to determine wave order, task assignments, and completion status.

## Template

```markdown
# {Feature Name}

## Overview

{One paragraph summary of what the feature does and why it exists.}

## Quick Links

- [Requirements](./requirements.md) — full requirements and acceptance criteria
- [Action Required](./action-required.md) — manual steps needing human action

## Dependency Graph

​```mermaid
graph TD
    task-01-name["01: Task Title"]
    task-02-name["02: Task Title"]
    task-03-name["03: Task Title"]
    task-01-name --> task-03-name
    task-02-name --> task-03-name
​```

## Waves

| Wave | Tasks | Description |
|------|-------|-------------|
| 1 | task-01, task-02 | {Brief description of what this wave accomplishes} |
| 2 | task-03 | {Brief description} |

## Task Status

### Wave 1
- [ ] [task-01-{name}](./tasks/task-01-{name}.md) — {One-line title}
- [ ] [task-02-{name}](./tasks/task-02-{name}.md) — {One-line title}

### Wave 2
- [ ] [task-03-{name}](./tasks/task-03-{name}.md) — {One-line title}
```

## Key Points

- The **Dependency Graph** uses Mermaid syntax (widely rendered in GitHub, VS Code, etc.). Each node shows the task number and title for quick reference.
- The **Waves** table provides a scannable overview of what runs in parallel.
- The **Task Status** section uses markdown checkboxes that the `implement-feature` skill updates as tasks complete. The orchestrator parses these to determine which wave to resume from.
- Links to task files use relative paths pointing into the `tasks/` subfolder.
- Tasks without dependencies have no incoming arrows in the graph — these form Wave 1.
