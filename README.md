# Selofy Shopify Skill Hub

[![Install with skills](https://img.shields.io/badge/install-npx%20skills%20add-111827?logo=npm&logoColor=white)](https://github.com/lvsao/shopify-skill-hub)
[![Skills](https://img.shields.io/badge/skills-1-2563eb)](./skills)
[![Categories](https://img.shields.io/badge/categories-6-16a34a)](./catalog)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Shopify](https://img.shields.io/badge/built%20for-Shopify-7AB55C?logo=shopify&logoColor=white)](https://www.shopify.com/)

🛍️ Public AI agent skills for Shopify and ecommerce operators.

## About

Selofy Shopify Skill Hub is an open-source skill library for Shopify sellers who want AI agents to help with real store work: content, SEO, product feeds, setup, social repurposing, and daily operations.

The repository is designed as the public source of truth for Skill Hub:

- 🧩 Skills are reviewable GitHub folders, not hidden prompts.
- ⚙️ Skills can include small native scripts when scripts make work safer or faster.
- 🛡️ Shopify writes must stay dry-run-first and approval-based.
- 🌱 Beginner onboarding should reuse one shared Skill Hub env file.
- 🚀 Skills install with the `skills` CLI and can later sync into Selofy Web.

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
  INDEX.json
  content-creation/
    CATEGORY.md
    skills.json
  seo-growth/
    CATEGORY.md
    skills.json
  product-feed/
    CATEGORY.md
    skills.json
  store-setup/
    CATEGORY.md
    skills.json
  social-media/
    CATEGORY.md
    skills.json
  operations/
    CATEGORY.md
    skills.json
examples/
  skill-hub.env.example
AGENTS.md
LICENSE
README.md
```

## Categories

Categories are folder-first. Each category lives at `catalog/<category-slug>/` so people can browse the repository naturally on GitHub. `catalog/INDEX.json` is only a machine-readable index for sync jobs and UI tooling.

Selofy Web currently expects these public Skill Hub category slugs:

- `content-creation`
- `seo-growth`
- `product-feed`
- `store-setup`
- `social-media`
- `operations`

Use these folder names and slugs unless Selofy Web is updated first.

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
