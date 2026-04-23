---
name: wechat-to-shopify-blog
description: Convert an owned or authorized WeChat Official Account article into a Shopify blog article draft. Use when the user provides a mp.weixin.qq.com article URL and wants an AI agent to extract the article, filter useful images, upload selected images to Shopify Files with SEO-friendly filenames and alt text, adapt the copy to store brand voice, choose the right Shopify blog container, insert a relevant internal product link when appropriate, and create an unpublished Shopify article draft.
---

# WeChat To Shopify Blog

## Non-Negotiables

- Work in English internally unless the target article language requires another language.
- Create only a Shopify draft article. Never publish the article.
- Ask for explicit approval before any Shopify write: staged upload, fileCreate, or articleCreate.
- Do not require Agent Browser, Playwright, scraping libraries, image libraries, or extra skills.
- Use native runtime features only: shell, Node.js built-in `fetch`, built-in `FormData`, local filesystem, and the model's own multimodal image understanding when available.
- Recommend a multimodal model with image recognition. If the active model cannot inspect images, stop and ask the user to switch to one before uploading images.
- Never print or store access tokens, session cookies, or merchant data in public files.
- Delete all temporary image files and temporary folders after the workflow completes or fails.

## Beginner Onboarding First

Start every first-time run by checking the shared Skill Hub env file. Do not create a separate env file for this skill. Future Skill Hub skills must reuse the same file.

Use this private shared file path:

```text
.skill-hub/skill-hub.env
```

If the file does not exist, tell the user to create it with this header and fields:

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.
# Reuse this file for all current and future Skill Hub skills.

SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
SKILL_HUB_SHOPIFY_STOREFRONT_API_ACCESS_TOKEN=shpat_or_public_storefront_token
SKILL_HUB_SHOPIFY_API_VERSION=2026-04
```

Guide the user to create a Shopify custom app and Admin API access token with Shopify's tutorial:

```text
https://help.shopify.com/en/manual/apps/app-types/custom-apps
```

Permission guidance:

- Ask the user to enable all Admin API scopes for the custom app.
- Ask the user to enable all Storefront API scopes for the same app when Storefront API access is available.
- Explain that Skill Hub uses one shared app/token setup so later skills do not require repeated permission edits.

Do not ask for `SHOPIFY_API_SECRET_KEY` unless a future Skill Hub skill explicitly needs OAuth app development.

Before continuing, check:

- `node -v` works. If not, ask the user to install Node.js LTS.
- The env file exists.
- `SKILL_HUB_SHOPIFY_STORE_DOMAIN` and `SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN` are present.
- `SKILL_HUB_SHOPIFY_STOREFRONT_API_ACCESS_TOKEN` is present when Storefront API work is needed.
- A read-only Shopify GraphQL request succeeds.

Use the bundled native context script when available:

```text
node skills/wechat-to-shopify-blog/scripts/shopify-context.mjs --env .skill-hub/skill-hub.env
```

## Bundled Native Scripts

This skill includes small Node.js scripts to reduce repeated boilerplate. They use only built-in Node.js APIs and do not install dependencies.

- `scripts/shopify-context.mjs`: Load the private env file, verify Shopify access, read shop brand context, blogs, recent articles, all products, optional target article data, and homepage meta.
- `scripts/related-product-block.mjs`: Convert one selected product JSON object into a consistent related-product HTML block with an internal product link and optional product image.

Treat script output as merchant context. Do not commit generated JSON or temporary product files.

## User Reply Flow

Keep setup concise. Do not ask the user to say "I filled the env file." Do not ask whether the user confirms permission to reuse, translate, or rewrite the article.

Tell the user:

```text
After you finish the shared Skill Hub env file, send the WeChat article URL and choose a rewrite style: A, B, C, or D.
```

Offer these four input choices:

- `A` - copy unchanged, formatting only.
- `B` - light polish.
- `C` - medium rewrite.
- `D` - deep rewrite with research materials and FAQ.

Map those choices into three internal rewrite modes:

- `A -> Format only`: keep the original content unchanged and only clean structure, headings, lists, and layout.
- `B -> Clean polish`: lightly polish wording so the copy is smoother and more natural.
- `C or D -> Deep rewrite`: fully rewrite the content for brand voice. For `D`, also add research materials, references, and FAQ.

Ask for blog container only if automatic selection is uncertain. If confidence is high, include the chosen blog in the dry-run plan instead of asking.

## Required Order

Always complete brand context before fetching or rewriting the WeChat article.

1. Load env and validate Shopify connection.
2. Read Shopify brand voice context and the full product catalog.
3. Choose the Shopify blog container.
4. Fetch and parse the WeChat article.
5. Inspect and filter images with the multimodal model.
6. Select one related product when the internal rewrite mode is `Deep rewrite`.
7. Prepare the dry-run plan.
8. After approval, upload selected images to Shopify Files.
9. Create the draft article.
10. Verify the draft and delete temporary files.

## Brand Voice Context

Read all available store context before article extraction:

- `shop.name`
- `shop.description`
- `shop.myshopifyDomain`
- `shop.primaryDomain.host`
- `shop.primaryDomain.url`
- all blog containers: `id`, `title`, `handle`
- recent articles, at least the latest 2-3 when available: `title`, `handle`, `summary`, `publishedAt`, `author.name`, and `blog`
- all products, paginated until Shopify returns no next page:
  - `id`
  - `title`
  - `handle`
  - `description`
  - `productType`
  - `vendor`
  - `onlineStoreUrl`
  - `featuredMedia.preview.image`
  - `media.nodes.preview.image` and `media.nodes.image`
  - `priceRangeV2`

Also fetch the public homepage from the primary domain with native `fetch` and read:

- `<title>`
- `<meta name="description">`

If the public homepage cannot be fetched, continue with Shopify API data only and note the gap in the dry-run plan.

Use `shop.name` as the article author. Never use a placeholder author such as "Skill Hub Test".

Prefer the bundled `scripts/shopify-context.mjs` helper for this step. It uses only native Node.js, reads the private env file, fetches store/blog/article/product context, fetches homepage meta, and outputs JSON for the agent to analyze. Do not commit its output if it contains merchant data.

When the internal rewrite mode is `Deep rewrite`:

- Analyze recent article title style, section style, summary style, and CTA style.
- Detect numbered title patterns such as "No. 138", "Issue 138", "Post 138", or similar.
- If a stable latest number exists, increment it for the new draft title.
- If the numbering pattern is unclear, do not invent a number. Mention it in the dry-run plan.

## Blog Container Selection

Do not default to `News`.

Choose the target blog by comparing:

- article topic and intent
- blog `title` and `handle`
- recent article topics in each blog
- language fit
- whether the blog is used for guides, stories, news, tutorials, journals, or product education

If there is one blog, use it. If there are multiple blogs and one is clearly best, choose it and explain why in the dry-run plan. If confidence is low, ask the user to choose one blog.

## Related Product Insertion

When the internal rewrite mode is `Deep rewrite`, insert one relevant related product if the store has a product that naturally fits the article.

Use the full product catalog from the brand voice step. Select the product by matching:

- article topic and keywords
- product title, handle, description, product type, and vendor
- store positioning from the brand voice context
- natural reader intent at a specific article section

If no product is relevant, do not force a product insertion. Explain that no strong match was found.

For the selected product:

- Use `onlineStoreUrl` as the internal product link.
- If `onlineStoreUrl` is missing, build the internal link as `https://<primary-domain>/products/<handle>`.
- Embed the product image in the related product block whenever product media exists.
- Use image priority: `featuredMedia.preview.image.url`, then the first `media.nodes` image URL.
- If the best related product has no product image, do not silently omit the image. Choose the next relevant product that has an image, or ask the user to add/choose a product image before creating the draft.
- Place the block where it best supports the article, usually after a section that mentions the product problem, workflow, or buying intent. Do not place it mechanically at the end if another location reads better.
- Keep the block clearly editorial. Do not make unsupported claims.

Use the bundled `scripts/related-product-block.mjs` helper when useful. It turns one selected product JSON object into consistent HTML with a product link and optional product image.

Preserve or add external source/reference links only when they are relevant and authorized. The WeChat source URL can be included as a source link when appropriate. The related product link must be an internal Shopify product link.

## WeChat Article Extraction

Use native `fetch` first. Extract from the WeChat HTML:

- title
- subtitle or description
- original thumbnail/cover image
- author
- publish date if available
- article body text and heading-like blocks
- image URLs from `data-src` first, then `src`

Map the WeChat subtitle/description to Shopify `summary`. Never use an image, image alt text, or image URL as the subtitle or summary.

The Shopify article thumbnail must come from the WeChat article's real cover/thumbnail, not from the first body image. Resolve the thumbnail in this order:

1. JavaScript variables such as `msg_cdn_url`, `msg_cover`, or equivalent cover variables in the WeChat page source.
2. Open Graph or Twitter image meta tags when present.
3. A rendered DOM image explicitly identified as the cover, such as `alt="cover_image"`.

Do not use a body screenshot, community banner, QR image, author avatar, or the first article image as the thumbnail unless it is confirmed to be the official WeChat cover. Upload the confirmed thumbnail through the same Shopify Files staged upload flow, then use its Shopify CDN URL for `article.image`.

Format the article HTML with clean semantic tags:

- one `h1` only if the theme needs it in body; otherwise use the Shopify article title as the H1 equivalent
- `h2` and `h3` for sections
- `p` for paragraphs
- `ul` or `ol` for lists
- `strong` only for meaningful emphasis
- `figure`, `img`, and `figcaption` for selected images

Remove WeChat-only residue, QR prompts, account follow prompts, paid-community ads, coupon/referral blocks, decorative dividers, and footer navigation.

## Image Filtering

Use the simplest safe image workflow.

First, ask the multimodal model to inspect candidate online image URLs directly. Provide each candidate URL with nearby article text and ask whether it is:

- keep: meaningful article content, product screenshot, tool screenshot, process screenshot, chart, or example
- reject: QR code, author avatar, follow prompt, paid community ad, coupon/referral ad, decorative divider, placeholder, footer image, or unrelated promotion

If the model cannot inspect online image URLs, download candidate images into one temporary folder and inspect the local files one by one. Use only native download methods. Do not install libraries.

Keep only images that directly support the article body. If uncertain, reject the image unless the user explicitly asks to keep it.

Do not use the first image of the WeChat article as the Shopify article cover by default. Select the best meaningful article image as the cover. If no image is clearly suitable, omit `article.image`.

For every kept image, generate:

- SEO-friendly filename in lowercase hyphen-case with the correct extension
- concise, descriptive alt text
- a short caption only when it helps the reader

## Shopify Files Upload

Use staged upload as the required Shopify Files method so filenames are controlled.

Do not use direct `fileCreate(originalSource: wechatImageUrl)` as the normal path. Direct transfer can work, but it can produce non-SEO filenames such as `640.png` and can fail when Shopify compares filename extensions against WeChat CDN URLs.

For each selected image:

1. Download the image to a temporary local file named with the SEO-friendly filename.
2. Detect or preserve the correct MIME type and extension.
3. Call `stagedUploadsCreate` with:
   - `filename`
   - `mimeType`
   - `resource: IMAGE`
   - `httpMethod: POST`
4. Upload the file bytes to the returned staged target URL using the returned form parameters.
5. Call `fileCreate` with:
   - `originalSource: stagedTarget.resourceUrl`
   - `contentType: IMAGE`
   - `alt`
   - `filename`
6. Poll the created `MediaImage` until `fileStatus` is `READY`.
7. Use the returned Shopify CDN `image.url` in the article HTML.

If any image upload fails, exclude that image from the draft and report it in the dry-run or final verification. Do not fall back to hotlinking WeChat images in the Shopify article.

## Draft Article Creation

Create the article with `articleCreate`.

Set:

- `blogId`: selected blog container ID
- `title`: generated or adapted title
- `author.name`: `shop.name`
- `summary`: WeChat subtitle/description adapted to brand voice
- `body`: formatted HTML with Shopify CDN image URLs
- `image`: selected meaningful cover image, if any
- `isPublished: false`
- `metafields`:
  - `namespace: global`, `key: title_tag`, `type: single_line_text_field`
  - `namespace: global`, `key: description_tag`, `type: single_line_text_field`

Do not add tags automatically. Do not touch tax settings.

## Dry-Run Approval

Before any Shopify write, show a concise dry-run plan:

- target store and brand name
- selected blog and selection reason
- rewrite level and target language
- title and summary
- SEO title and SEO description
- selected related product, link, image, and insertion location when `Deep rewrite` is selected
- selected WeChat thumbnail/cover image
- kept images with filenames and alt text
- rejected image count and main rejection reasons
- whether recent-article numbering was detected

Ask for explicit approval to upload files and create the Shopify draft.

## Verification And Cleanup

After creating the draft:

- Query the created article by ID.
- Confirm `publishedAt` is `null`.
- Confirm `author.name` equals `shop.name`.
- Confirm `summary` comes from the WeChat subtitle/description, not an image.
- Confirm all body image URLs are Shopify CDN URLs.
- Confirm the related product block uses an internal product link when one was inserted.
- Confirm the related product block includes a product image when one was inserted.
- Confirm the article image matches the real WeChat thumbnail/cover, not the first body image.
- Confirm SEO metafields exist.
- Confirm no automatic tags were added.
- Delete the temporary image folder and all downloaded images.

If cleanup fails, tell the user the exact temporary path that still needs removal.

## Shopify API References

Use the current Shopify Admin GraphQL documentation before changing API shapes:

- `shop` query: `https://shopify.dev/docs/api/admin-graphql/latest/queries/shop`
- `blogs` query: `https://shopify.dev/docs/api/admin-graphql/latest/queries/blogs`
- `articles` query: `https://shopify.dev/docs/api/admin-graphql/latest/queries/articles`
- `products` query: `https://shopify.dev/docs/api/admin-graphql/latest/queries/products`
- `stagedUploadsCreate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/stagedUploadsCreate`
- `fileCreate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileCreate`
- `articleCreate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/articleCreate`
- `articleUpdate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/articleUpdate`
