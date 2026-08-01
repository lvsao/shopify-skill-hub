---
name: Bug report
about: Report a reproducible problem in a skill or repository workflow
title: "[Bug] "
labels: bug
assignees: ''
---

## What happened?

Describe the result and what you expected instead.

## Skill or file

Name the skill, script, or workflow and include its version or commit when known.

## Reproduction

List the smallest safe reproduction steps. Remove tokens, session cookies, store-specific private data, and customer information.

## Validation

- [ ] `node scripts/sync-onboarding.mjs --check`
- [ ] `node scripts/release-preflight.mjs`
- [ ] The report does not include secrets or private merchant data.
