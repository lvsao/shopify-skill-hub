# Selofy Shopify Skill Hub

[![Install with skills.sh](https://img.shields.io/badge/install-skills.sh-2563eb)](https://skills.sh/lvsao/shopify-skill-hub)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Shopify](https://img.shields.io/badge/built%20for-Shopify-7AB55C?logo=shopify&logoColor=white)](https://www.shopify.com/)

Open-source AI agent skills for Shopify and ecommerce operators.

Language: English | [中文](./README.zh-CN.md)

Every skill is a reviewable folder with a clear trigger, documented limits, and preview-first Shopify writes.

## Install

List available skills:

```bash
npx skills add lvsao/shopify-skill-hub --list
```

Install one skill:

```bash
npx skills add lvsao/shopify-skill-hub --skill <skill-name>
```

Install the full collection:

```bash
npx skills add lvsao/shopify-skill-hub
```

## Current skills

The table below is the current public skill index; each name links to its source folder.

| Skill | Category | Use it for |
| --- | --- | --- |
| [`wechat-to-shopify-blog`](./skills/wechat-to-shopify-blog) | Content | Turn an owned or authorized WeChat article into a Shopify blog draft. |
| [`optimize-shopify-alt-text`](./skills/optimize-shopify-alt-text) | SEO | Audit and improve product, collection, and article image alt text. |
| [`shopify-product-serp-optimizer`](./skills/shopify-product-serp-optimizer) | SEO | Improve product search snippets and metadata in reviewable batches. |
| [`shopify-blog-seo-optimizer`](./skills/shopify-blog-seo-optimizer) | SEO | Audit a Shopify article and prepare safer SEO improvements. |
| [`seo-backlink-opportunity-finder`](./skills/seo-backlink-opportunity-finder) | SEO | Research evidence-backed backlink prospects without promising placements. |
| [`shopify-gmc-misrepresentation-auditor`](./skills/shopify-gmc-misrepresentation-auditor) | Product feed | Audit public store pages for Google Merchant Center policy risks. |
| [`shopify-theme-apps-detector`](./skills/shopify-theme-apps-detector) | Operations | Detect a public Shopify store's theme and apps with evidence. |
| [`shopify-store-translator`](./skills/shopify-store-translator) | Operations | Translate Shopify resources with a preview-first, approval-based workflow. |
| [`shopify-markets-localization-auditor`](./skills/shopify-markets-localization-auditor) | Operations | Review Markets, languages, shipping coverage, and international SEO readiness. |
| [`shopify-product-images-downloader`](./skills/shopify-product-images-downloader) | Operations | Download product images from a public Shopify store. |
| [`shopify-checkout-payment-connection-check`](./skills/shopify-checkout-payment-connection-check) | Operations | Inspect checkout, delivery choices, and payment setup without placing an order. |
| [`yuntu-yw-shipping`](./skills/yuntu-yw-shipping) | Operations | Track, quote, and prepare YunExpress or Yanwen shipping requests. |

For full descriptions, features, integrations, and access badges, see the matching entry in [`catalog/`](./catalog).

## Shopify access and safety

- Public-web skills such as the GMC auditor, theme/app detector, image downloader, and backlink finder do not need Shopify credentials.
- Store-connected skills explain their required access in `SKILL.md`. They should read and preview first; Shopify writes require explicit approval.
- If a skill needs credentials, copy [`examples/skill-hub.env.example`](./examples/skill-hub.env.example) to a private `skill-hub.env` in your working directory. Never commit tokens or merchant data.

## Repository map

```text
skills/    Canonical skill instructions and scripts
catalog/   Public metadata used by the Skill Hub and sync jobs
examples/  Safe local configuration templates
scripts/   Validation and sync tooling
```

`catalog/` is the metadata source for the public Skill Hub. GitHub Actions validates changes and syncs the `main` branch to Selofy Web after a successful push.

## Contributing

Keep skill names lowercase and hyphenated. Add or update the skill folder and its catalog entry together, then run:

```bash
node scripts/sync-onboarding.mjs --check
node scripts/release-preflight.mjs
```

## License

MIT.
