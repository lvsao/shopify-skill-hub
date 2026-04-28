---
name: wechat-to-shopify-blog
description: Convert an owned or authorized WeChat Official Account article into a Shopify blog article draft. Use when the user provides a mp.weixin.qq.com article URL and wants an AI agent to extract the article, filter useful images, upload selected images to Shopify Files with SEO-friendly filenames and alt text, adapt the copy to store brand voice, choose the right Shopify blog container, insert a relevant internal product link when appropriate, and create an unpublished Shopify article draft.
---

# WeChat To Shopify Blog

## Non-Negotiables

- Write the final Shopify blog draft in English by default. Translate and adapt the WeChat article into English even when the user or source article uses another language.
- Create only a Shopify draft article. Never publish the article.
- Ask for explicit approval before any Shopify write: staged upload, fileCreate, or articleCreate.
- Do not require Agent Browser, Playwright, scraping libraries, image libraries, or extra skills.
- Use native runtime features only: shell, Node.js built-in `fetch`, built-in `FormData`, local filesystem, and the model's own multimodal image understanding when available.
- Recommend a multimodal model with image recognition. If the active model cannot inspect images, stop and ask the user to switch to one before uploading images.
- Never print or store access tokens, session cookies, or merchant data in public files.
- Do not create hidden onboarding folders. Keep the shared env as one `skill-hub.env` file in the user's current working directory.
- Keep the user's working folder clean. Delete every temporary image, JSON plan, downloaded file, generated helper file, and ad hoc script after the workflow completes or fails.
- Do not create a text-only Shopify article when the WeChat article has selected images. If Shopify image upload fails, stop, report the exact failed step, and ask before retrying or creating a text-only fallback.
- Do not replace the bundled Shopify helper with ad hoc REST, PowerShell, or temporary Node scripts. If the helper fails, inspect its error, fix the helper or input manifest, and rerun the helper.

## Beginner Onboarding First

Minimize user decisions and actions. Before asking any setup question, inspect the local environment first:

0. Determine the user's working directory first. Run `pwd` or `Get-Location` in the terminal where the user is working and treat that directory as `USER_WORKDIR`. Do not use the skill installation folder, `~/.agents/skills/...`, `.codex/skills/...`, or the repository containing this skill as the env lookup location unless that is also the terminal's current working directory.
1. Check whether `USER_WORKDIR/skill-hub.env` exists. Do not use IDE file search scoped to the skill folder to decide this, because installed skills live outside the user's project folder.
2. If it exists, read only the variable names and whether required values are present. Do not print secrets.
3. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `admin_custom_app` and the store domain plus Admin API token are present, run the bundled context script.
4. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `dev_dashboard_app` and the `.myshopify.com` store domain plus Client ID are present, run the bundled context script.
5. If the context script succeeds, continue directly. Do not ask where the app was created.
6. If the user says "already configured", "B is configured", or similar, treat that as a request to inspect `skill-hub.env`, not as an A/B answer.

When calling the bundled helper from an installed skill, the script path may be absolute, but the env path must remain in `USER_WORKDIR`. Prefer this pattern on Windows:

```powershell
$userWorkdir = (Get-Location).Path
$envFile = Join-Path $userWorkdir "skill-hub.env"
node "$env:USERPROFILE\.agents\skills\wechat-to-shopify-blog\scripts\shopify-context.mjs" --env $envFile
```

If running inside a cloned Skill Hub repository, a relative script path is fine, but still pass the env from the user's working directory:

```powershell
$envFile = Join-Path (Get-Location).Path "skill-hub.env"
node skills/wechat-to-shopify-blog/scripts/shopify-context.mjs --env $envFile
```

Never `cd` into the skill folder just to run a helper. If you must use a different command working directory, pass an absolute `--env` path pointing to `USER_WORKDIR/skill-hub.env`.

Ask the setup question only when `skill-hub.env` is missing, incomplete, placeholder-only, or the access method cannot be determined:

```text
Where did you create your Shopify app?

A - Shopify store Settings custom app (Legacy Custom App)
B - Dev Dashboard app
```

Then create or update one private shared file in the current working directory:

```text
skill-hub.env
```

Immediately ensure `.gitignore` contains `skill-hub.env`. Add that line if it is missing. Do not ask the user to create the env file or update `.gitignore` manually.

### Path A: Shopify Store Settings Custom App (Legacy Custom App)

Use this only when the merchant can still create a custom app from the Shopify store Settings area. Create the env file with:

```powershell
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs init-env --method admin_custom_app --env skill-hub.env
```

This creates `skill-hub.env` with this minimal template:

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
```

Ask the user to fill only `SKILL_HUB_SHOPIFY_STORE_DOMAIN` and `SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN`.

Use this path's domain resolution before Admin GraphQL:

- If the domain already ends with `.myshopify.com`, use it directly.
- Otherwise, make a read-only POST probe to `https://{domain}/admin/api/{version}/graphql.json` with `redirect: manual`.
- If Shopify returns a 301 or another 3xx redirect to a `.myshopify.com` host, use that host for all Admin API calls.
- Never print the resolved API host together with the user's token.

### Path B: Dev Dashboard App

Use this as the preferred fallback when Legacy Custom App creation is unavailable. The user provides only the app and store basics; the agent handles Shopify CLI, scopes, authorization, and verification.

Create the env file with:

```powershell
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
```

This creates `skill-hub.env` with this minimal template:

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id
```

Ask the user to fill only those two values. For Dev Dashboard apps, require the `.myshopify.com` domain because Shopify CLI store authorization is store-specific.

Do not ask for the Client secret for this workflow unless a future helper explicitly implements client credential token exchange. The bundled helpers use Shopify CLI store authorization after deploy.

Before continuing:

1. Check `node -v` and `npm -v`. If either is missing, stop and ask the user to install Node.js LTS.
2. Check `shopify version`.
3. If Shopify CLI is missing, install it for the user:

```powershell
npm install -g @shopify/cli@latest
```

4. If Shopify CLI exists but is older than the version that supports `shopify store`, upgrade it:

```powershell
npm install -g @shopify/cli@latest
```

5. Verify `shopify store --help` works.

Then let the agent configure scopes through Shopify CLI. Do not ask the user to manually enter scopes in Dev Dashboard.

Do not run `shopify store list` or `shopify auth status`; these are not valid diagnostics for this workflow in current Shopify CLI. Do not repeatedly run manual `shopify store execute` commands for content work when the bundled helper is available.

Required scopes for this skill:

```text
read_products,write_content,write_files
```

`write_content` covers the article/blog read-write path for this workflow. If Shopify reports that any scope has been renamed for the current API surface, use the current equivalent from Shopify docs or CLI validation and keep the scope set minimal.

CLI setup sequence for agents:

```powershell
$tmp = Join-Path $env:TEMP ("skill-hub-shopify-app-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
shopify app config link --client-id <client-id> --path $tmp --no-color
```

Edit only `$tmp\shopify.app.toml`:

```toml
[access_scopes]
scopes = "read_products,write_content,write_files"
```

Then run:

```powershell
shopify app config validate --path $tmp --no-color
shopify app deploy --client-id <client-id> --path $tmp --allow-updates --no-color
```

After deployment, do not send the user to Dev Dashboard to look for a manual approval button. Instead, run Shopify CLI store authorization with the required scopes. Tell the user before running it: "A Shopify permission authorization page may open next. Please review the scopes and click authorize."

```powershell
shopify store auth --store <store>.myshopify.com --scopes read_products,write_content,write_files --json --no-color
```

After the user completes the browser authorization, verify with the bundled helper:

```powershell
node skills/wechat-to-shopify-blog/scripts/shopify-context.mjs --env skill-hub.env --product-page-size 1
```

If verification still returns `Access denied`, rerun `shopify store auth` with the required scopes. Do not invent a Dev Dashboard approval step.

After successful authorization, do not ask the user to copy or paste short-lived access tokens.

The bundled helpers run Shopify CLI through its JavaScript entrypoint and use query/output files internally. Do not replace them with shell-generated GraphQL commands unless you are doing narrow troubleshooting.

Always remove the temporary CLI app config directory after setup succeeds or fails.

### Shared Checks

Before continuing with article work, check:

- `node -v` works.
- `skill-hub.env` exists and is ignored by Git.
- The selected credential path has the required fields.
- A read-only Shopify Admin GraphQL request succeeds.

Use the bundled native context script when available:

```text
node skills/wechat-to-shopify-blog/scripts/shopify-context.mjs --env skill-hub.env
```

## Bundled Native Scripts

This skill includes small Node.js scripts to reduce repeated boilerplate. They use only built-in Node.js APIs and do not install dependencies.

- `scripts/shopify-context.mjs`: Load the private env file, verify Shopify access, read shop brand context, blogs, recent articles, all products, optional target article data, and homepage meta.
- `scripts/fetch-wechat-article.mjs`: Fetch a WeChat article with native `fetch`, parse title, description, author, cover image, body text, and body image URLs, and optionally download candidate images to a temporary folder.
- `scripts/shopify-blog-admin.mjs`: Reusable Shopify Admin helper for `context`, `upload-images`, `create-draft`, and `verify`. It previews by default and writes only when called with `--execute`.
- `scripts/related-product-block.mjs`: Convert one selected product JSON object into a consistent related-product HTML block with an internal product link and optional product image.

Treat script output as merchant context. Do not commit generated JSON or temporary product files. Prefer these bundled scripts over writing new one-off scripts.

Reference commands:

```text
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs init-env --method admin_custom_app --env skill-hub.env
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
node skills/wechat-to-shopify-blog/scripts/shopify-context.mjs --env skill-hub.env --product-page-size 50
node skills/wechat-to-shopify-blog/scripts/fetch-wechat-article.mjs --url <mp.weixin.qq.com URL>
node skills/wechat-to-shopify-blog/scripts/fetch-wechat-article.mjs --url <mp.weixin.qq.com URL> --download-images --output-dir <temporary-existing-or-disposable-folder>
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs context --env skill-hub.env --product-page-size 50
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs upload-images --env skill-hub.env --input image-manifest.json
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs upload-images --env skill-hub.env --input image-manifest.json --execute
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs create-draft --env skill-hub.env --input draft-article.json --require-images
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs create-draft --env skill-hub.env --input draft-article.json --execute --require-images
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs update-draft --env skill-hub.env --article-id gid://shopify/Article/... --input draft-article.json --execute --require-images
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs verify --env skill-hub.env --article-id gid://shopify/Article/...
```

Use `--execute` only after explicit user approval. Delete `image-manifest.json`, `draft-article.json`, downloaded images, and any temporary folders after verification.

## User Reply Flow

Keep setup concise. Do not ask the user to say "I filled the env file." Do not ask whether the user confirms permission to reuse, translate, or rewrite the article.

Tell the user:

```text
After you finish the shared Skill Hub env file, send the WeChat article URL and choose a rewrite style: A, B, C, or D.
```

Offer these four input choices:

- `A` - translate to English with formatting only.
- `B` - translate to English with light polish.
- `C` - translate to English with medium rewrite.
- `D` - translate to English with deep rewrite, research materials, and FAQ.

Map those choices into three internal rewrite modes:

- `A -> English format only`: translate faithfully and only clean structure, headings, lists, and layout.
- `B -> English clean polish`: translate and lightly polish wording so the copy is smoother and more natural.
- `C or D -> English deep rewrite`: translate and fully rewrite the content for brand voice. For `D`, also add research materials, references, and FAQ.

Ask for blog container only if automatic selection is uncertain. If confidence is high, include the chosen blog in the preview plan instead of asking.

## Required Order

Always validate Shopify access before any Shopify-dependent work. After access is valid, read-only context gathering can run in parallel.

1. Load env and validate Shopify connection.
2. Read Shopify brand voice context and the full product catalog. This can overlap with WeChat extraction after access is valid.
3. Choose the Shopify blog container.
4. Fetch and parse the WeChat article. This can overlap with Shopify context loading, but rewriting and product matching must wait for both outputs.
5. Inspect and filter images with the multimodal model.
6. Translate or rewrite the article into English.
7. Evaluate related products and select one product for insertion when there is a natural match.
8. Prepare the preview plan.
9. After approval, upload selected images to Shopify Files.
10. Build or update the related product block using the selected product.
11. Replace every kept WeChat image reference in the article HTML with the Shopify CDN URLs returned by the upload helper.
12. Create or update the draft article with `--require-images`.
13. Verify the draft contains Shopify CDN image URLs and the related product block when a product was selected, then delete temporary files.

## Safe Parallel Work

Use sub-agents when the host environment supports them and the work can be split safely:

- Main agent only: create or update `skill-hub.env`, add it to `.gitignore`, validate Shopify access, handle secrets, request approval, upload files, create or update the draft, verify, and clean up.
- Phase 1 can run in parallel after access is valid:
  - Shopify context sub-agent: summarize `shop`, blogs, recent articles, homepage meta, and product catalog.
  - WeChat extraction sub-agent: fetch the article, download selected source images, and return the article JSON plus `shopifyUploadManifest`.
- Phase 2 can run in parallel after both Phase 1 outputs exist:
  - Image review sub-agent: review image batches and return keep/reject reasons.
  - English rewrite sub-agent: draft title, summary, outline, and body direction.
  - Product matching sub-agent: score product candidates and recommend one insertion point.
- Do not parallelize Shopify writes. Image upload must finish before body HTML is finalized, and draft creation must wait for Shopify CDN URLs.
- Do not let sub-agents create local scripts, edit env files, delete files, or perform final verification. Ask sub-agents for structured output only.
- Pass sanitized context to sub-agents whenever possible. Do not pass full access tokens unless the delegated task strictly needs API access.

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
  - `status`
  - `tags`
  - `seo.title`
  - `seo.description`
  - `collections.nodes.title`
  - `collections.nodes.handle`
  - `onlineStoreUrl`
  - `featuredMedia.preview.image`
  - `media.nodes.preview.image` and `media.nodes.image`
  - `priceRangeV2`

Also fetch the public homepage from the primary domain with native `fetch` and read:

- `<title>`
- `<meta name="description">`

If the public homepage cannot be fetched, continue with Shopify API data only and note the gap in the preview plan.

Use `shop.name` as the article author. Never use a placeholder author such as "Skill Hub Test".

Prefer the bundled `scripts/shopify-context.mjs` helper for this step. It uses only native Node.js, reads the private env file, fetches store/blog/article/product context, fetches homepage meta, and outputs JSON for the agent to analyze. Do not commit its output if it contains merchant data.

When the internal rewrite mode is `Deep rewrite`:

- Analyze recent article title style, section style, summary style, and CTA style.
- Detect numbered title patterns such as "No. 138", "Issue 138", "Post 138", or similar.
- If a stable latest number exists, increment it for the new draft title.
- If the numbering pattern is unclear, do not invent a number. Mention it in the preview plan.

## Blog Container Selection

Do not default to `News`.

Choose the target blog by comparing:

- article topic and intent
- blog `title` and `handle`
- recent article topics in each blog
- language fit
- whether the blog is used for guides, stories, news, tutorials, journals, or product education

If there is one blog, use it. If there are multiple blogs and one is clearly best, choose it and explain why in the preview plan. If confidence is low, ask the user to choose one blog.

## Related Product Insertion

Always evaluate related products when Shopify products exist. When the internal rewrite mode is `Deep rewrite`, insert one relevant related product if the store has a product that naturally fits the article. Do not merely mention that a product was found in the preview plan; the final Shopify article body must include the related product block unless there is no strong match.

Use the full product catalog from the brand voice step. Build a top-3 shortlist before selecting. Score products by matching:

- article topic and keywords
- product title, handle, description, product type, vendor, tags, SEO title, SEO description, and collection names
- store positioning from the brand voice context
- natural reader intent at a specific article section
- product availability for the storefront, product image quality, and valid product URL

If no product is relevant, do not force a product insertion. Explain that no strong match was found in the preview plan and in the final verification note. Do not silently skip this step.

For the selected product:

- Use `onlineStoreUrl` as the internal product link.
- If `onlineStoreUrl` is missing, build the internal link as `https://<primary-domain>/products/<handle>`.
- Embed the product image in the related product block whenever product media exists.
- Use image priority: `featuredMedia.preview.image.url`, then the first `media.nodes` image URL.
- Product images are already Shopify media. Do not upload product images through Shopify Files again.
- If the best related product has no product image, do not silently omit the image. Choose the next relevant product that has an image, or ask the user to add/choose a product image before creating the draft.
- Place the block where it best supports the article, usually after a section that mentions the product problem, workflow, or buying intent. Do not place it mechanically at the end if another location reads better.
- Keep the block clearly editorial. Do not make unsupported claims.
- Use the helper output as real HTML inserted into `bodyHtml`. Verify the final article contains `data-selofy-related-product="true"` and an internal `/products/` or `onlineStoreUrl` link.

Use the bundled `scripts/related-product-block.mjs` helper when useful. It turns one selected product JSON object into consistent HTML with a product link and optional product image.

```text
node skills/wechat-to-shopify-blog/scripts/related-product-block.mjs --product selected-product.json --primary-domain <primary-domain> --heading "Related product"
```

Delete `selected-product.json` after the task finishes.

Preserve or add external source/reference links only when they are relevant and authorized. The WeChat source URL can be included as a source link when appropriate. The related product link must be an internal Shopify product link.

## WeChat Article Extraction

Use the bundled native script first:

```text
node skills/wechat-to-shopify-blog/scripts/fetch-wechat-article.mjs --url <mp.weixin.qq.com URL>
```

It uses only Node.js built-ins and extracts from the WeChat HTML:

- title
- subtitle or description
- original thumbnail/cover image
- author
- publish date if available
- article body text and heading-like blocks
- image URLs from `data-src` first, then `src`
- `shopifyUploadManifest` when images are downloaded, so the upload helper can consume it directly

When image files need local inspection or Shopify upload preparation, use:

```text
node skills/wechat-to-shopify-blog/scripts/fetch-wechat-article.mjs --url <mp.weixin.qq.com URL> --download-images --output-dir <temporary-existing-or-disposable-folder>
```

Delete that output folder after the task. Do not keep WeChat images in the user's project folder after the final Shopify draft is verified.

When saving extraction output, create a temporary JSON file only long enough to pass `shopifyUploadManifest` into `shopify-blog-admin.mjs upload-images`. Delete it after upload succeeds.

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

## Shopify Admin API Operations

Prefer the bundled `scripts/shopify-blog-admin.mjs` helper for Shopify Admin operations. It contains validated Admin GraphQL shapes for:

- brand context: `shop`, `blogs`, `articles`, paginated `products`
- image staging: `stagedUploadsCreate`
- Shopify Files: `fileCreate`
- blog draft creation: `articleCreate`
- post-write verification: `article(id:)`

The helper previews by default. It writes only when called with `--execute`.

## Shopify Files Upload

Use staged upload as the required Shopify Files method so filenames are controlled. Prefer:

```text
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs upload-images --env skill-hub.env --input image-manifest.json
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs upload-images --env skill-hub.env --input image-manifest.json --execute
```

`image-manifest.json` should be the `shopifyUploadManifest` array returned by `fetch-wechat-article.mjs`, or an object with `{ "images": [...] }`. Each item must include `path`, `filename`, `mimeType`, and `alt`.

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
6. Let `shopify-blog-admin.mjs upload-images --execute` poll each created `MediaImage` until `fileStatus` is `READY`.
7. Use the returned `files[].url` Shopify CDN URL in the article HTML and cover `article.image.url`.

If any selected image upload fails, stop before article creation. Do not silently exclude the image, do not create a no-image draft, and do not fall back to hotlinking WeChat images in the Shopify article. Continue only after the user approves a retry strategy or explicitly accepts a text-only draft.

## Draft Article Creation

Create the article with `articleCreate`. Prefer:

```text
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs create-draft --env skill-hub.env --input draft-article.json --require-images
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs create-draft --env skill-hub.env --input draft-article.json --execute --require-images
```

If a previous run already created a text-only draft, fix it instead of creating another article:

```text
node skills/wechat-to-shopify-blog/scripts/shopify-blog-admin.mjs update-draft --env skill-hub.env --article-id gid://shopify/Article/... --input draft-article.json --execute --require-images
```

Set:

- `blogId`: selected blog container ID
- `title`: English generated or adapted title
- `author.name`: `shop.name`
- `summary`: English summary adapted from the WeChat subtitle/description and brand voice
- `body`: English formatted HTML with Shopify CDN image URLs
- `image`: selected meaningful cover image, if any
- `isPublished: false`
- `metafields`:
  - `namespace: global`, `key: title_tag`, `type: single_line_text_field`
  - `namespace: global`, `key: description_tag`, `type: single_line_text_field`

Do not add tags automatically. Do not touch tax settings.

Before running `create-draft --execute` or `update-draft --execute`, confirm the draft body contains `<img>` tags using `cdn.shopify.com` URLs whenever the WeChat article has selected body images. The `--require-images` flag enforces this gate.

## Preview Approval

Before any Shopify write, show a concise preview plan:

- target store and brand name
- selected blog and selection reason
- rewrite level and target language: English
- title and summary
- SEO title and SEO description
- top 3 related product candidates with short reasons, plus the selected product, link, image, and insertion location when a product will be inserted
- the no-match reason when no product is inserted
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
- Confirm the related product block contains `data-selofy-related-product="true"` when a product was selected.
- Confirm the related product block uses an internal product link when one was inserted.
- Confirm the related product block includes a product image when one was inserted.
- If no product was inserted, confirm the final note includes the no-match reason.
- Confirm the article image matches the real WeChat thumbnail/cover, not the first body image.
- Confirm SEO metafields exist.
- Confirm no automatic tags were added.
- Delete the temporary image folder and all downloaded images.
- Delete temporary JSON inputs such as `image-manifest.json`, `draft-article.json`, article extraction output, and any one-off helper scripts the agent created.
- Re-scan the working directory for AI-generated leftovers before finishing. Keep only user-provided files, the intended `skill-hub.env`, and committed skill source files.

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
