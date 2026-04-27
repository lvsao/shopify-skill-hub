# Selofy Shopify Skill Hub

[![Install with skills](https://img.shields.io/badge/install-npx%20skills%20add-111827?logo=npm&logoColor=white)](https://github.com/lvsao/shopify-skill-hub)
[![Skills](https://img.shields.io/badge/skills-2-2563eb)](./skills)
[![Categories](https://img.shields.io/badge/categories-6-16a34a)](./catalog)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Shopify](https://img.shields.io/badge/built%20for-Shopify-7AB55C?logo=shopify&logoColor=white)](https://www.shopify.com/)

🛍️ Public AI agent skills for Shopify and ecommerce operators.

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

## Shopify API Access And Env

Most Skill Hub skills need limited Shopify Admin API access before they can read store context or prepare a preview. Keep the credentials in one private local file:

```text
skill-hub.env
```

Do not commit this file or paste secrets into chat. Add `skill-hub.env` to `.gitignore`.

### Option A: Shopify Admin custom app

Use this when your Shopify Admin still allows custom app creation. Create a custom app in Shopify Admin, enable only the Admin API scopes required by the skill, then copy the Admin API access token into:

```text
# Skill Hub Shopify API credentials
# Private local file. Do not commit.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
```

You can use the domain you normally recognize, such as `your-store.com` or `your-store.myshopify.com`. Skill scripts resolve the correct Shopify Admin API host before making Admin GraphQL calls.

Shopify guide: [Create custom apps in Shopify](https://help.shopify.com/en/manual/apps/app-types/custom-apps)

### Option B: Shopify Dev Dashboard app

Use this when you prefer a Partner/Dev Dashboard app flow, or when Admin custom app creation is not available.

1. Create a Shopify Partner account.
2. In the Dev Dashboard, create an app.
3. In `Distribution`, choose custom distribution and install the app to your own store.
4. In the app settings, copy the Client ID, Client secret, and use your store's exact `.myshopify.com` domain.

These three values are the app's key material for Skill Hub:

```text
# Skill Hub Shopify API credentials
# Private local file. Do not commit.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id
SKILL_HUB_SHOPIFY_CLIENT_SECRET=shpss_xxx
```

After the app is installed, the agent can use Shopify CLI to release the skill's required scopes and ask you to approve the permission update. The bundled scripts request short-lived access tokens automatically; you should not manually copy temporary tokens.

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

## License

MIT. This keeps public skills easy to review, reuse, fork, and install.
