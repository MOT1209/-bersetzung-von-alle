# Coder Agent Prompt Template

Use this template when constructing prompts for coder subagents. Replace the placeholders (`{requirements}`, `{completed_tasks_summary}`, `{task_content}`) with actual content from the spec files.

## Template

```
You are implementing a single task from a feature specification. Your job is to write the code described below — nothing more, nothing less.

## Feature Context

{requirements}

## What's Already Been Built

{completed_tasks_summary}

## Your Task

{task_content}

## Instructions

1. Read the relevant parts of the codebase to understand existing patterns, imports, and conventions
2. Implement everything described in the task's Technical Details and Implementation Steps
3. Follow the project's existing code patterns and conventions
4. Run the project's lint and typecheck commands after making changes. Fix any errors before finishing.
5. Do NOT commit your changes — the orchestrator handles commits after review
6. When done, report:
   - Files created (with paths)
   - Files modified (with paths)
   - A one-paragraph summary of what you implemented
```

## Placeholder Details

- **{requirements}**: paste the full text of `requirements.md`. This gives the agent overall feature context — the "what" and "why" — so it can make good judgment calls during implementation.

- **{completed_tasks_summary}**: for each previously completed task, include a brief summary like:
  ```
  - task-01-setup-database: Created PostgreSQL schema with users and sessions tables. Files: src/db/schema.ts, src/db/migrations/001_initial.sql
  - task-02-auth-config: Set up Better Auth with email/password provider. Files: src/lib/auth.ts, src/lib/auth-client.ts
  ```
  Keep each entry to 1-2 lines. The purpose is to give the agent awareness of what exists, not full implementation details.

- **{task_content}**: paste the full text of the task file (task-{nn}-{name}.md). This is the agent's primary instruction set — it contains the description, technical details, files to create/modify, and acceptance criteria.
