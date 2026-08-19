<h1 align="center">Selofy Shopify Skill Hub</h1>

<p align="center">
  Preview-first AI skills for Shopify SEO, content, store audits, feeds, and operations.
</p>

<p align="center">
  <a href="https://skills.sh/lvsao/shopify-skill-hub">Install with skills.sh</a>
  ·
  <a href="https://www.selofy.com/shopify-skill-hub">Open Skill Hub</a>
  ·
  <a href="./README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://skills.sh/lvsao/shopify-skill-hub"><img src="https://img.shields.io/badge/install-skills.sh-2563eb" alt="Install with skills.sh"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="MIT license"></a>
  <a href="https://www.shopify.com/"><img src="https://img.shields.io/badge/built%20for-Shopify-7AB55C?logo=shopify&logoColor=white" alt="Built for Shopify"></a>
</p>

Each skill is a reviewable folder with a clear trigger, documented limits, and approval-based Shopify writes.

## Pick a workflow

| If you want to… | Start here | What it covers |
| --- | --- | --- |
| Publish useful content | [`wechat-to-shopify-blog`](./skills/wechat-to-shopify-blog) · [Content catalog](./catalog/content-creation) | Turn an owned or authorized WeChat article into a Shopify blog draft. |
| Improve organic traffic | [`optimize-shopify-alt-text`](./skills/optimize-shopify-alt-text) · [`shopify-product-serp-optimizer`](./skills/shopify-product-serp-optimizer) · [SEO catalog](./catalog/seo-growth) | Improve image alt text, product snippets, blog SEO, and backlink research. |
| Check or operate a store | [`shopify-operations-brief`](./skills/shopify-operations-brief) · [`shopify-theme-apps-detector`](./skills/shopify-theme-apps-detector) · [`shopify-markets-localization-auditor`](./skills/shopify-markets-localization-auditor) · [Operations catalog](./catalog/operations) | See sales, shipping, low-stock reminders, and store operations. |
| Prepare feeds or shipments | [`shopify-gmc-misrepresentation-auditor`](./skills/shopify-gmc-misrepresentation-auditor) · [`yuntu-yw-shipping`](./skills/yuntu-yw-shipping) · [Feed catalog](./catalog/product-feed) | Review Google Merchant Center risks and prepare YunExpress or Yanwen requests. |

## Quick start

```bash
# Browse the available skills
npx skills add lvsao/shopify-skill-hub --list

# Install one skill
npx skills add lvsao/shopify-skill-hub --skill <skill-name>

# Or install the full collection
npx skills add lvsao/shopify-skill-hub
```

## How the workflow works

| Choose | Preview | Approve |
| --- | --- | --- |
| Pick the skill that matches the task. | Read store context and produce a plan, report, or draft. | Review the proposed changes before anything writes to Shopify. |

## Browse the full catalog

<details>
<summary>Show all public skills</summary>

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
| [`shopify-operations-brief`](./skills/shopify-operations-brief) | Operations | Generate a read-only store performance report and private HTML brief. |
| [`yuntu-yw-shipping`](./skills/yuntu-yw-shipping) | Operations | Track, quote, and prepare YunExpress or Yanwen shipping requests. |

For full descriptions, features, integrations, and access badges, see [`catalog/`](./catalog).
</details>

## Access and safety

- Public-web skills such as the GMC auditor, theme/app detector, image downloader, and backlink finder do not need Shopify credentials.
- Store-connected skills explain their required access in `SKILL.md`. They read and preview first; Shopify writes require explicit approval.
- If a skill needs credentials, copy [`examples/skill-hub.env.example`](./examples/skill-hub.env.example) to a private `skill-hub.env`. Never commit tokens or merchant data.

## Repository

```text
skills/    Canonical skill instructions and scripts
catalog/   Public metadata used by Skill Hub and sync jobs
examples/  Safe local configuration templates
scripts/   Validation and sync tooling
```

`catalog/` is the metadata source for the public Skill Hub. GitHub Actions validates changes and syncs the `main` branch to Selofy Web after a successful push.

To maintain the repository, update the skill folder and its catalog entry together, then run:

```bash
node scripts/sync-onboarding.mjs --check
node scripts/release-preflight.mjs
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the contribution checklist and [`SECURITY.md`](./SECURITY.md) for reporting security issues.

## License

MIT.
