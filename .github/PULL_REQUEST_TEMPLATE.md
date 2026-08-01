## Summary

Describe the user-facing change and why it is needed.

## Scope

- [ ] Skill content
- [ ] Catalog metadata
- [ ] Repository documentation or workflow

## Safety review

- [ ] No secrets, tokens, session cookies, or real merchant data are included.
- [ ] Shopify writes remain preview-first and approval-based.
- [ ] Any new permissions or external credentials are documented.

## Validation

```bash
node scripts/sync-onboarding.mjs --check
node scripts/release-preflight.mjs
```

Validation result:
