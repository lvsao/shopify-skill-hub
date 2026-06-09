---
name: optimize-shopify-alt-text
description: Audit and safely improve Shopify image alt text for product media, collection images, article featured images, and article inline images. Use when a merchant wants image-specific alt text review, batch planning, visual inspection when available, or approved Shopify alt text updates.
---

# Optimize Shopify Alt Text

## Non-Negotiables

- **MUST** run `npx --yes skills update optimize-shopify-alt-text -g -y` first. If it fails, stop. If it succeeds, re-read this file plus `references/onboarding-guide.md` and `references/alt-text-rules.md`.
- Preview every proposed write first. Use `--execute` only after explicit approval.
- Never edit anything except image alt text. For article bodies, only update inline `<img alt="">` attributes.
- Do not claim visual inspection unless the host actually opened the local image through native image input.
- If vision is unavailable, switch to context-only fallback and mark the lower confidence clearly.
- Keep artifacts clean: `skill-hub.env` may stay in the working directory; temp downloads and machine-readable plans must be deleted after use.
- Keep alt text concise. Target 60-120 characters, default to 125 or fewer, and never exceed Shopify's 512-character hard limit.

## Read First

- `references/onboarding-guide.md` for shared Shopify setup
- `references/alt-text-rules.md` for wording, length, and duplicate rules

## Supported Surfaces

- Product `MediaImage` alt text
- Collection featured image `altText`
- Article featured image `altText`
- Article inline image `alt` attributes in `article.body`

## Routing Rules

- If the user names a product, collection, article, media ID, or CDN image URL, start with `target`.
- Use `scan` only for store-wide requests, batch planning, ambiguity resolution, or post-write verification counts.
- Add `--download` only for the current review batch.

```text
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --product "Example Product"
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --collection <collection-handle-or-url>
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --article <article-url-or-title>
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --media-id gid://shopify/MediaImage/...
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --url <cdn-image-url>
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs scan --env skill-hub.env --page-size 50
```

## Workflow

1. Follow shared onboarding only when `skill-hub.env` is missing or incomplete.
2. Run `connection-check`.
3. Use `target` for specific requests or `scan` for broad requests.
4. If vision is needed, run `vision-sample` and verify the model can describe pixel facts from a local file.
5. Review the current batch against `references/alt-text-rules.md`.
6. Build one preview plan with source labels such as `vision` or `context_only`.
7. Run `apply` without `--execute` for the preview packet.
8. After approval, rerun `apply --execute`.
9. Verify counts or the named target, then clean temp files.

## Script Entry Points

Use the bundled helper instead of ad hoc GraphQL or one-off scripts:

```text
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs init-env --method admin_custom_app --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs connection-check --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs scan --env skill-hub.env --page-size 50
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs vision-sample --env skill-hub.env --limit 3
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs apply --env skill-hub.env --input -
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs apply --env skill-hub.env --input - --execute
```

## Output And Verification

- Output should stay conversational plus preview JSON or stdout from the helper.
- After execution, verify the updated target with `target` or `scan`.
- Report any `context_only` items separately.
