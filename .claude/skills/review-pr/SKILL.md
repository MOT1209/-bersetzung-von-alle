---
name: review-pr
description: >
  Review pull requests with complexity-adaptive depth — spawning deep-dive agents for medium
  and complex PRs. Use this skill when the user says "review this PR", "review PR #123",
  "check this pull request", "give me a code review", or wants feedback on a PR before merging.
  Also use when the user says "/review-pr" or pastes a GitHub PR URL. Requires the GitHub CLI (gh).
---

# Review Pull Request

Review pull requests with a depth that matches their complexity. Simple PRs get a direct review; complex PRs get parallel deep-dive agents analyzing security, performance, and architecture.

## Arguments

The user should provide PR number(s) or URL(s). If none provided, ask for them.

## Instructions

### Step 1: Retrieve PR Details

Use the GitHub CLI to get the full picture:

```bash
gh pr view {pr_number} --json title,body,files,additions,deletions,commits,author,reviews,comments
gh pr diff {pr_number}
```

### Step 2: Assess Complexity

Score the PR based on:
- Number of files changed
- Lines added/removed
- Number of commits
- Whether changes touch core/architectural files

**Simple** (direct review, no agents):
- 5 or fewer files AND 100 or fewer lines AND single author

**Medium** (1-2 deep-dive agents):
- 6-15 files, OR 100-500 lines, OR 2 contributors

**Complex** (up to 3 deep-dive agents):
- More than 15 files, OR more than 500 lines, OR more than 2 contributors, OR touches core architecture

### Step 3: Analyze

**For Simple PRs**: review directly — read the diff, check for issues, provide feedback.

**For Medium/Complex PRs**: spawn deep-dive agents in parallel using the `Agent` tool with `subagent_type: "deep-dive"`. Each agent gets a focused area:

- **Agent 1 — Code Quality**: conventions, patterns, maintainability, test coverage
- **Agent 2 — Security**: input validation, auth checks, injection risks, data exposure
- **Agent 3 — Architecture** (Complex only): design patterns, separation of concerns, performance implications, backwards compatibility

Each agent receives the PR diff and description and returns a structured review.

### Step 4: Vision Alignment

Read the project's `README.md` and `CLAUDE.md` to understand the application's purpose. Assess whether the PR aligns with the project's intended direction. Flag significant deviations — not as a blocker, but as a consideration for the reviewer.

### Step 5: Safety Assessment

Provide an overall assessment:
- **Safe to merge**: no significant issues found
- **Merge with caution**: minor issues that should be noted but aren't blocking
- **Needs changes**: issues that should be fixed before merging

Include a risk level (low/medium/high) with justification.

### Step 6: Report

Structure the review as:

```
## PR Review: #{pr_number} — {title}

### Complexity: {Simple|Medium|Complex}
{Brief justification}

### Summary
{2-3 sentence overview of what the PR does}

### Issues Found
{Grouped by severity: high → medium → low}
- **{severity}**: {file:line} — {description}

### Improvements Suggested
{Optional improvements ranked by importance and implementation complexity}

### Vision Alignment
{Does this PR align with the project's direction?}

### Verdict: {Safe to merge | Merge with caution | Needs changes}
Risk level: {low|medium|high}
{Brief justification}
```
