# Selofy Shopify Skill Hub

Public AI agent skills for Shopify and ecommerce operators.

This repository is the source of truth for Selofy Skill Hub skills. Skills are written as reviewable GitHub files, installable with the `skills` CLI, and designed for beginner-friendly Shopify workflows.

## Install

Install all public skills from this repository:

```bash
npx skills add lvsao/shopify-skill-hub
```

Install only the WeChat to Shopify Blog skill:

```bash
npx skills add lvsao/shopify-skill-hub --skill wechat-to-shopify-blog
```

List available skills before installing:

```bash
npx skills add lvsao/shopify-skill-hub --list
```

For local development before a GitHub push:

```bash
npx skills add . --list
```

## Current Skills

| Skill | Category | Purpose |
| --- | --- | --- |
| `wechat-to-shopify-blog` | `content-creation` | Convert an owned or authorized WeChat Official Account article into a Shopify blog draft, including Shopify Files image hosting, brand voice adaptation, blog selection, and related product insertion. |

## Shared Shopify Env

Skill Hub skills share one local env file instead of creating separate files for every skill.

Create this file locally:

```text
.skill-hub/skill-hub.env
```

Use this shape:

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
SKILL_HUB_SHOPIFY_STOREFRONT_API_ACCESS_TOKEN=shpat_or_public_storefront_token
SKILL_HUB_SHOPIFY_API_VERSION=2026-04
```

For the Shopify custom app setup guide, see:

```text
https://help.shopify.com/en/manual/apps/app-types/custom-apps
```

Use one custom app for Skill Hub and enable all Admin API scopes plus all Storefront API scopes when available. This reduces repeated permission changes as new skills are added.

## Repository Layout

```text
skills/
  wechat-to-shopify-blog/
    SKILL.md
    agents/
      openai.yaml
    scripts/
      shopify-context.mjs
      related-product-block.mjs
catalog/
  categories.json
  skills.json
examples/
  skill-hub.env.example
AGENTS.md
LICENSE
README.md
```

## Categories

Selofy Web currently expects these public Skill Hub category slugs:

- `content-creation`
- `seo-growth`
- `product-feed`
- `store-setup`
- `social-media`
- `operations`

Use these category slugs in catalog metadata unless Selofy Web is updated first.

## Authoring Rules

- Keep every public skill in `skills/<skill-name>/`.
- Use lowercase hyphen-case names.
- Every skill must contain `SKILL.md` with YAML frontmatter fields `name` and `description`.
- Keep skill folders lean: add `scripts/`, `references/`, and `assets/` only when they directly improve execution.
- Do not commit secrets, store data, screenshots with private data, or generated merchant context.
- Do not write Shopify resources without an explicit dry-run and user approval.
- Prefer native scripts with no dependencies when reliability can be improved.

## Validation

Validate the current skill with:

```bash
python C:\Users\qiuru\.codex\skills\.system\skill-creator\scripts\quick_validate.py skills\wechat-to-shopify-blog
node --check skills\wechat-to-shopify-blog\scripts\shopify-context.mjs
node --check skills\wechat-to-shopify-blog\scripts\related-product-block.mjs
npx skills add . --list
```

## GitHub Release Flow

1. Validate the skill locally.
2. Commit focused changes.
3. Push `main` to GitHub.
4. Verify remote install:

```bash
npx skills add lvsao/shopify-skill-hub --list
```

## License

MIT. This keeps public skills easy to review, reuse, fork, and install.
