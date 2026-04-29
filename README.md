# Selofy Shopify Skill Hub

[![Install with skills](https://img.shields.io/badge/install-npx%20skills%20add-111827?logo=npm&logoColor=white)](https://github.com/lvsao/shopify-skill-hub)
[![Skills](https://img.shields.io/badge/skills-3-2563eb)](./skills)
[![Categories](https://img.shields.io/badge/categories-6-16a34a)](./catalog)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Shopify](https://img.shields.io/badge/built%20for-Shopify-7AB55C?logo=shopify&logoColor=white)](https://www.shopify.com/)

🛍️ Public AI agent skills for Shopify and ecommerce operators.

Language: English | [中文](./README.zh-CN.md)

## About

Selofy Shopify Skill Hub is a free, open-source library of AI agent skills for Shopify sellers. Use it to install transparent, reviewable workflows for Shopify content creation, SEO growth, product feed cleanup, store setup, social content repurposing, and day-to-day ecommerce operations.

The repository is designed as the public source of truth for Skill Hub:

- 🧩 Skills are reviewable GitHub folders, not hidden prompts.
- ⚙️ Skills can include small native scripts when scripts make work safer or faster.
- 🛡️ Shopify writes must stay preview-first and approval-based.
- 🌱 Beginner onboarding should keep Shopify API credentials in one private local env file.
- 🚀 Skills install with the `skills` CLI and can later sync into Selofy Web.

## Install

Install all public skills from this repository:

```bash
npx skills add lvsao/shopify-skill-hub
```

Install one specific skill with `--skill`. For example, to install only the WeChat to Shopify Blog skill:

```bash
npx skills add lvsao/shopify-skill-hub --skill wechat-to-shopify-blog
```

Or install only the Shopify alt text optimization skill:

```bash
npx skills add lvsao/shopify-skill-hub --skill optimize-shopify-alt-text
```

Or install only the Shopify product SERP optimization skill:

```bash
npx skills add lvsao/shopify-skill-hub --skill shopify-product-serp-optimizer
```

List available skills before installing:

```bash
npx skills add lvsao/shopify-skill-hub --list
```

Preview skills from a local checkout while authoring or reviewing repository changes:

```bash
npx skills add . --list
```

This local command is for maintainers only. Regular users should install from GitHub with `npx skills add lvsao/shopify-skill-hub`.

## Current Skills

| Skill | Category | Purpose |
| --- | --- | --- |
| `wechat-to-shopify-blog` | `content-creation` | Convert an owned or authorized WeChat Official Account article into a Shopify blog draft, including Shopify Files image hosting, brand voice adaptation, blog selection, and related product insertion. |
| `optimize-shopify-alt-text` | `seo-growth` | Audit Shopify product media, collection featured images, article featured images, and article inline images, then prepare a preview-first alt text optimization plan with real image understanding when available and safe context-only fallback when it is not. |
| `shopify-product-serp-optimizer` | `seo-growth` | Scan Shopify products, plan five-product SERP optimization batches, generate polished HTML audit reports, and apply only approved product SEO metadata or reviewed media alt updates. |

## Shopify API Access And Env

Most Skill Hub skills need limited Shopify Admin API access before they can read store context or prepare a preview. There are mainly two ways to grant your store's API access for these skills. If you are new, install any skill first and the AI agents will guide you from 0 to 1 through the environment setup. Keep credentials in one private local file in your current working directory:

```text
skill-hub.env
```

Two environment shapes are used in this repository.

### Dev Dashboard app (recommanded)

1. Create a Shopify Partner account.
2. In the Dev Dashboard, create an app.
3. In `Distribution`, choose custom distribution and install the app to your own store.
4. In the app settings, copy the Client ID.
5. Use your store's exact `.myshopify.com` domain in `skill-hub.env`.

Tutorial: https://www.selofy.com/tutorials/ai-ecommerce/shopify-ai-agents-custom-app-skill

Minimal template:

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id
```

For this repository's current Shopify CLI store-auth workflow, `SKILL_HUB_SHOPIFY_CLIENT_SECRET` is not required. The agent uses Shopify CLI to apply the required scopes and then runs `shopify store auth` for the target store.

### Shopify store Settings custom app (Legacy Custom App)

Use this only when your store Settings still allows Legacy Custom App creation and you prefer the direct Admin token path.

Tutorial: https://www.selofy.com/tutorials/ai-ecommerce/ai-agents-skills-shopify-operations

Minimal template:

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
```

Skill scripts resolve the correct Shopify Admin API host before making Admin GraphQL calls.

Shopify guide: [Create custom apps in Shopify](https://help.shopify.com/en/manual/apps/app-types/custom-apps)

### Important notes

- `skill-hub.env` is shared across skills in your current working directory.
- Different skills may require different Admin scopes, but the env file shape stays the same.
- Dev Dashboard uses `store domain + client id` because authorization is completed through Shopify CLI.
- Legacy Custom App uses `store domain + admin token` because the token is created in Shopify store Settings.

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
  optimize-shopify-alt-text/
    SKILL.md
    agents/
      openai.yaml
    references/
      alt-text-rules.md
    scripts/
      shopify-alt-text-admin.mjs
  shopify-product-serp-optimizer/
    SKILL.md
    agents/
      openai.yaml
    assets/
      report-template.html
    references/
      serp-methodology.md
    scripts/
      shopify-product-serp-admin.mjs
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
README.zh-CN.md
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

## License

MIT. This keeps public skills easy to review, reuse, fork, and install.
