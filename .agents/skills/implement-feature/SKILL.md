---
name: implement-feature
description: >
  Orchestrate parallel implementation of a feature specification by dispatching coder agents
  wave-by-wave with code review gates between waves. Use this skill when the user says
  "implement this feature", "start implementing", "run the spec", "execute the plan",
  "continue implementing", or wants to begin coding a previously planned feature from a
  specs/{feature}/ folder. Also use when the user says "/implement-feature" or drags a spec
  folder into the conversation and asks to implement it. This skill does NOT write code itself —
  it orchestrates coder subagents that work in parallel.
---

# Implement Feature

Orchestrate the parallel implementation of a feature specification by dispatching coder agents wave-by-wave. This skill reads a spec folder (created by `create-spec`), identifies the next wave of parallelizable work, spawns coder agents for each task, and runs a code review gate before moving to the next wave.

The orchestrator never writes code itself. Its job is to:
1. Parse the spec and determine what to do next
2. Give each coder agent exactly the context it needs
3. Verify the results via code review
4. Manage the fix loop if review finds issues
5. Track progress and commit completed waves

## Prerequisites

A `specs/{feature}/` directory containing:
- `README.md` with wave assignments and task status checkboxes
- `requirements.md` with feature context
- `tasks/task-{nn}-*.md` files (one per task, self-contained)

This structure is produced by the `create-spec` skill. If the user doesn't have a spec folder, suggest they create one first.

## Orchestration

### Step 1: Load the Spec

1. Read `specs/{feature}/README.md`
2. Read `specs/{feature}/requirements.md`
3. Parse the **Task Status** section in the README — look at the checkboxes:
   - `- [x]` = completed task (skip)
   - `- [ ]` = pending task (include)
4. Determine the **current wave**: the first wave that has any incomplete tasks
5. If all tasks in all waves are complete, report "All tasks complete!" and stop

This makes the skill **resumable** — if invoked on a partially completed spec, it picks up exactly where it left off.

### Step 2: Process Each Wave

For each wave starting from the current one, execute Steps 3 through 8 below, then advance to the next wave.

### Step 3: Prepare Wave Tasks

1. Read all incomplete task files for this wave from the `tasks/` subfolder
2. **Check for file overlaps**: scan the "Files to Create" and "Files to Modify" sections across all tasks in this wave. If any file appears in more than one task, warn the user:

   ```
   Warning: File overlap detected in Wave {N}:
   - {file-path} is modified by both task-{nn} and task-{mm}

   Options:
   1. Proceed anyway (risk of conflicts)
   2. Run these tasks sequentially instead of in parallel
   ```

   Wait for the user's decision before proceeding.

### Step 4: Dispatch Coder Agents

For each task in the wave, spawn a coder agent using the `Agent` tool with `subagent_type: "coder"`. Spawn all agents for the wave in a **single message** so they run in parallel.

Read `references/coder-prompt-template.md` and construct each agent's prompt by filling in:
- **{requirements}**: full text of `requirements.md`
- **{completed_tasks_summary}**: for each previously completed task, a one-paragraph summary of what was implemented and what files were created/modified (extract from the task file's Description section plus any completion notes)
- **{task_content}**: full text of the task file being assigned

The coder agents should NOT commit their changes — the orchestrator handles commits after review.

### Step 5: Collect Results

Wait for all coder agents in the wave to complete. Each agent should report:
- Files created
- Files modified
- A summary of what was implemented

If any agent fails (returns an error or crashes), note the failure and continue with the remaining results. Report the failure to the user after the wave.

### Step 6: Code Review Gate

Spawn a single review agent using the `Agent` tool with `subagent_type: "code-review"`.

Read `references/review-prompt-template.md` and construct the review prompt by filling in:
- **{wave_number}**: current wave number
- **{requirements}**: full text of `requirements.md`
- **{task_summaries}**: for each task in this wave, the task title and the coder agent's completion summary
- **{verification_commands}**: the project's lint and typecheck commands (e.g., `pnpm lint && pnpm typecheck`)

The review agent should:
1. Run lint and typecheck
2. Verify acceptance criteria from each task file
3. Check that files integrate correctly (imports resolve, types match)
4. Check for security issues and code quality
5. Return a structured verdict: **PASS** or **FAIL** with specific issues

### Step 7: Fix Loop

If the review returns **FAIL**:

1. Parse the issues from the review (file paths, descriptions, suggested fixes)
2. Group issues by the task they most closely relate to (match file paths against each task's "Files to Create/Modify")
3. For each group, spawn a coder agent with a fix prompt. Read `references/fix-prompt-template.md` and fill in:
   - **{issues}**: the specific issues for this task group
   - **{task_content}**: the original task file for context
4. After fix agents complete, re-run the review (Step 6)

**Cap at 3 review cycles per wave.** If the third review still fails, stop and report to the user:

```
Wave {N} review failed after 3 cycles. Outstanding issues:
{list of remaining issues}

Options:
1. Fix these manually and re-run /implement-feature
2. Proceed to the next wave anyway
3. Stop here
```

### Step 8: Complete the Wave

After the wave passes review (or the user chooses to proceed):

1. **Update task files**: for each completed task, change the Status field from `pending` to `complete`
2. **Update README.md**: change `- [ ]` to `- [x]` for each completed task
3. **Commit the wave**:
   ```
   git add -A
   git commit -m "feat({feature}): complete wave {N} — {brief summary}"
   ```
4. **Report wave completion**:
   ```
   Wave {N} of {total} complete.

   Tasks completed:
   - task-{nn}-{name}: {one-line summary}
   - task-{mm}-{name}: {one-line summary}

   Review: PASS
   Commit: {hash}

   Next: Wave {N+1} has {count} tasks ready for parallel execution.
   ```

### Step 9: Final Integration Review

After all waves are complete:

1. Run lint and typecheck one final time
2. Spawn a code-review agent to review the full scope of changes (all files modified across all waves)
3. Report the final status:

```
Feature "{feature}" implementation complete.

Waves completed: {N}/{N}
Total tasks: {T}

Verification:
- Lint: {PASS/FAIL}
- Typecheck: {PASS/FAIL}
- Integration review: {PASS/FAIL with notes}

Next steps:
- Review the changes
- Push and create a PR when ready
```

## Error Handling

- **Coder agent failure**: mark the task as failed, report to user, continue with remaining tasks in the wave. The review step will catch integration issues.
- **Lint/typecheck failure after fix attempts**: report the specific errors and ask the user whether to commit anyway or fix manually.
- **All tasks already complete**: report completion and stop.
- **Missing spec folder**: ask the user to provide the feature name or suggest creating a spec with `create-spec`.

## Key Principles

- **The orchestrator does not write code.** Its job is dispatch, review, and progress tracking. All implementation happens in coder subagents.
- **Each coder agent gets exactly one task.** This keeps each agent's context focused and manageable.
- **Completed task summaries are brief.** One paragraph per task — not the full file contents. This keeps coder agent prompts from growing unbounded as waves progress.
- **The review gate is non-negotiable.** Every wave gets reviewed before commit. This catches integration issues early rather than letting them compound across waves.
- **Progress is tracked in the spec files.** README checkboxes and task file status fields are the source of truth. This makes the skill resumable across sessions.
