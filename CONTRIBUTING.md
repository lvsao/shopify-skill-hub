# Contributing

Thanks for helping improve Selofy Shopify Skill Hub. Keep contributions focused, reviewable, and safe for Shopify merchants.

## Scope

This repository contains public skills, their catalog metadata, and small supporting scripts. Do not add frontend pages, backend APIs, database code, live merchant data, or credentials here.

## Add or update a skill

1. Use a lowercase, hyphenated folder name under `skills/`.
2. Keep the skill's `SKILL.md` concise and procedural. State when it should trigger, required access, safety boundaries, and failure modes.
3. Add or update the matching entry under `catalog/<category>/skills.json`. Keep the catalog name and relative path aligned with the skill folder.
4. Put large documentation in `references/`, deterministic helpers in `scripts/`, and reusable public files in `assets/`.
5. Keep Shopify writes preview-first and require explicit merchant approval before execution.
6. Never include secrets, session cookies, tokens, or real merchant data.

## Link and artifact hygiene

- Keep an external URL when it is an official API or policy source, a methodology citation, a required operating endpoint, or a runtime-derived destination that changes the skill's decision or output.
- Keep the citation beside the claim it supports. Do not add unlabelled referral links, unused third-party services, or copied link collections.
- Use clear placeholders for illustrative merchant/store URLs. Never use a real merchant, test-store, or private URL as an example.
- Do not commit `test/`, `tests/`, fixtures, generated reports, agent memory, caches, or scratch output. The release preflight rejects those tracked paths.

## Validate locally

Run these commands from the repository root:

```bash
node scripts/sync-onboarding.mjs --check
node scripts/release-preflight.mjs
```

If you add a helper script, also run its syntax check and one representative safe execution. Do not use a live Shopify write as a validation shortcut.

## Pull requests

- Keep one PR focused on one skill or one repository improvement.
- Explain the user-facing change and any permission or safety impact.
- Include validation results in the PR description.
- Do not commit `.env`, `skill-hub.env`, generated merchant output, or temporary files.
