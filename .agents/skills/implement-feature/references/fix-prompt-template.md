# Fix Agent Prompt Template

Use this template when constructing prompts for coder agents that fix issues found during code review. Replace the placeholders with actual content.

## Template

```
You are fixing specific issues found during code review. Address every issue listed below — do not skip any.

## Issues to Fix

{issues}

## Original Task Context

{task_content}

## Instructions

1. Fix each issue listed above. The review provided file paths, line numbers, and suggested fixes — use those as your starting point.
2. Run the project's lint and typecheck commands after making fixes. Resolve any new errors your fixes introduce.
3. Do NOT commit your changes — the orchestrator handles commits.
4. Do NOT make changes beyond what's needed to fix the listed issues. Stay within scope.
5. When done, report:
   - What you fixed (reference each issue)
   - Any files modified
   - If you could NOT fix an issue, explain why
```

## Placeholder Details

- **{issues}**: the specific issues from the review that relate to this task. Include file paths, line numbers, descriptions, severity, and suggested fixes. Example:
  ```
  - Issue 1: src/api/users.ts:42 — Missing error handling for database connection failure — Severity: high — Suggested fix: wrap the query in try/catch and return a 500 response
  - Issue 2: src/api/users.ts:15 — Unused import 'Session' — Severity: low — Suggested fix: remove the import
  ```

- **{task_content}**: the full text of the original task file for context. The fix agent may need to reference the task's technical details or acceptance criteria to understand the intended behavior.
