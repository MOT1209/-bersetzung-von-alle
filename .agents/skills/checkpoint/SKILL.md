---
name: checkpoint
description: >
  Create a comprehensive checkpoint commit with detailed analysis of all changes. Use this skill
  when the user says "checkpoint", "commit everything", "save my progress", "create a commit",
  or wants to stage and commit all current changes with a well-crafted message. Also use when
  the user says "/checkpoint" or asks to snapshot current work. This skill stages all changes
  and creates a descriptive commit — it does not push.
---

# Checkpoint Commit

Create a checkpoint commit that captures all current changes — but only after the code passes lint, type check, and build.

## Instructions

### Step 1: Analyze Changes

Run these commands to understand the full picture:

1. `git status` — see all tracked and untracked files
2. `git diff` — see detailed changes in tracked files
3. `git diff --cached` — see already-staged changes
4. `git log -5 --oneline` — understand this repo's commit message style

### Step 2: Quality Checks

Run all three checks. If any fail, fix the issues before proceeding — do not skip or ignore failures.

1. `npm run lint` — fix any lint errors
2. `npm run type-check` — fix any type errors (if the script doesn't exist, try `npx tsc --noEmit`)
3. `npm run build` — fix any build errors

Iterate until all three pass cleanly. Only then move to the next step.

### Step 3: Stage Everything

Stage all changes — tracked modifications, deletions, and new untracked files:

```bash
git add -A
```

### Step 4: Craft the Commit Message

Write a commit message following the project's existing conventions (observed from `git log`). Structure:

- **First line**: clear, concise summary in imperative mood (50-72 chars)
  - Use conventional commit prefixes where the project uses them: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc.
- **Body** (separated by blank line): a short TL;DR of the changes — 1-3 sentences max. No bullet lists, no file-by-file breakdowns, no lengthy explanations.
- **Footer**: co-author attribution

### Step 5: Commit

Create the commit using a heredoc for proper formatting:

```bash
git commit -m "$(cat <<'EOF'
{first line}

{tldr}

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Step 6: Report

Display:
- The commit hash and message summary
- Files changed count
- Insertions/deletions summary

## Important

- Stage and commit everything — do not skip files unless they are clearly sensitive (`.env`, credentials)
- If the repo has no git history, run `git init` first
- All quality checks (lint, type-check, build) MUST pass before committing — fix issues, don't skip them
- Keep the commit body short — a TL;DR, not an essay
- Follow the project's existing commit conventions (check the log first)
- Do not push — only commit locally
