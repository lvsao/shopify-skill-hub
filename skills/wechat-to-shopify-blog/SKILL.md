---
name: wechat-to-shopify-blog
description: Convert an owned or authorized WeChat Official Account article into a Shopify blog draft. Use when the user provides a `mp.weixin.qq.com` URL and wants extraction, image filtering, Shopify-hosted uploads, English adaptation, blog selection, and draft-only article creation.
---

# WeChat To Shopify Blog

## Non-Negotiables

- **MUST** run `npx --yes skills update wechat-to-shopify-blog -g -y` first. Then re-read this file and `references/onboarding-guide.md`.
- Final copy defaults to English unless the user explicitly wants another output language.
- Create only a draft article. Never publish.
- Any Shopify write needs explicit approval.
- If images are part of the chosen draft, do not silently fall back to a text-only article after an upload failure.
- Use the bundled scripts. Do not replace them with ad hoc REST calls or one-off scripts.
- Keep temp downloads and draft manifests out of the working directory after the run.

## Read First

- `references/onboarding-guide.md` for Shopify setup

## User Input

Ask for:

- the WeChat article URL
- rewrite style:
  - `A` format-only translation
  - `B` light polish
  - `C` medium rewrite
  - `D` deep rewrite with research or FAQ

## Required Order

1. Use shared onboarding only when `skill-hub.env` is missing or incomplete.
2. Validate Shopify access.
3. Load store context with `shopify-context.mjs`.
4. Fetch and parse the WeChat article.
5. Review and filter images with a multimodal model.
6. Rewrite the article into English.
7. Match and select a related product when there is a natural fit.
8. Preview the draft plan.
9. After approval, upload images, replace source URLs, and create or update the draft.
10. Verify the draft and remove temp files.

## Script Entry Points

```text
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs init-env --method admin_custom_app --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-context.mjs --env skill-hub.env --product-page-size 50
node <absolute-path-to-skill>/scripts/fetch-wechat-article.mjs --url <mp.weixin.qq.com URL>
node <absolute-path-to-skill>/scripts/fetch-wechat-article.mjs --url <mp.weixin.qq.com URL> --download-images --output-dir <temp-dir>
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs upload-images --env skill-hub.env --input image-manifest.json
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs upload-images --env skill-hub.env --input image-manifest.json --execute
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs create-draft --env skill-hub.env --input draft-article.json --require-images
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs create-draft --env skill-hub.env --input draft-article.json --execute --require-images
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs update-draft --env skill-hub.env --article-id gid://shopify/Article/... --input draft-article.json --execute --require-images
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs verify --env skill-hub.env --article-id gid://shopify/Article/...
```

## Output

- Draft article only
- Shopify-hosted image URLs when images are kept
- Optional related-product block when there is a credible match
