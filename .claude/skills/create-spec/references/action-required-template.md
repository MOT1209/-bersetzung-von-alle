# Action Required Template

Use this structure for the action-required.md at the root of each spec folder. This file captures manual steps that require human action and cannot be automated by agents.

## Template (when manual steps exist)

```markdown
# Action Required: {Feature Name}

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **{Action}** — {Brief reason why this is needed}
- [ ] **{Action}** — {Brief reason}

## During Implementation

- [ ] **{Action}** — {Brief reason}

## After Implementation

- [ ] **{Action}** — {Brief reason}

---

> These tasks are also referenced in context within the relevant task files.
```

## Template (when no manual steps exist)

```markdown
# Action Required: {Feature Name}

No manual steps required for this feature. All tasks can be implemented automatically.
```

## Common Manual Steps

- Account creation (third-party services, OAuth apps)
- API key generation and setup
- Environment variable configuration
- DNS or domain settings
- Billing or subscription setup
- Third-party service registration (webhooks, integrations)
- Certificate provisioning
- Access permissions or IAM roles

## Key Points

- Group actions by timing: before, during, and after implementation. This helps the user know when they need to act.
- Keep descriptions brief — one line explaining what to do and why.
- Also reference these manual steps in the relevant task files so agents know to pause or skip that part.
