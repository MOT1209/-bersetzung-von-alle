# CLAUDE.md

This project uses the **Agentic Coding Starter Kit** workflow. For Claude Code, the instructions in `AGENTS.md` are the source of truth and apply here.

Read `AGENTS.md` first — it defines planning rules, implementation rules, architecture, and testing requirements for this translation tool project ("AraLink").

Key points for Claude Code:

- The project is an Arabic RTL translation tool (URL → translated content). UI in Arabic, agent communication in English.
- No database for the MVP. Node.js + Express backend in `server/`.
- Skills live in `.claude/skills/` — check them before starting work.
- Use the `create-spec` and `implement-feature` skills for large features.
- The `translate-link` skill contains project-specific translation workflow guidance.
- Always run checks (`node --check`, manual browser test) before finishing.
