# Requirements Template

Use this structure for the requirements.md at the root of each spec folder.

## Template

```markdown
# Requirements: {Feature Name}

## Summary

{What the feature does and why it exists — 2-3 paragraphs covering the problem, the solution, and the expected outcome.}

## Goals

- {Goal 1}
- {Goal 2}
- {Goal 3}

## Non-Goals

{Explicitly out of scope — things that might seem related but are not part of this feature.}

- {Non-goal 1}
- {Non-goal 2}

## Acceptance Criteria

{High-level criteria for the entire feature. Individual task files have their own granular criteria.}

- [ ] {Criterion 1}
- [ ] {Criterion 2}
- [ ] {Criterion 3}

## Assumptions

{Things assumed to be true that could affect implementation if they turn out to be false.}

- {Assumption 1}
- {Assumption 2}

## Technical Constraints

{Architecture decisions, technology choices, or constraints that affect all tasks.}

- {Constraint 1}
- {Constraint 2}
```

## Key Points

- The requirements doc provides **overall feature context** that each coder agent receives alongside its task file. Keep it focused on the "what" and "why" — individual task files handle the "how."
- Non-goals are important: they prevent agents from over-building. If search functionality is out of scope, say so — otherwise a well-meaning agent might add it.
- Acceptance criteria here are feature-level (the whole thing works end-to-end). Task-level criteria live in each task file.
