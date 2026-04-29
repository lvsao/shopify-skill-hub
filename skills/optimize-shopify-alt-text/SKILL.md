---
name: optimize-shopify-alt-text
description: Audit, plan, and safely optimize Shopify image alt text for product media, collection featured images, article featured images, and article inline images. Use when a merchant wants an AI agent to scan Shopify images, test whether the active AI model can inspect images, generate concise alt text with multimodal image understanding when available or context-only fallback when it is not, review the proposed changes in batches, and apply approved Shopify Admin updates.
---

# Optimize Shopify Alt Text

## Non-Negotiables

- Use Shopify Admin GraphQL only after verifying access with the bundled helper.
- Preview proposed changes before asking for confirmation. Execute writes only after explicit user approval.
- Never publish content, edit product copy, replace images, delete files, or change article body text other than inline image `alt` attributes.
- Do not trust a model's self-report about image capability. Test whether the active model can inspect a local image before using the multimodal path.
- If image understanding is unavailable, use context-only fallback and mark lower confidence. Do not pretend the model inspected pixels.
- Downloading an image is not image inspection. The agent must actually open, attach, or view the local image through the host model's native image input or image-view tool before claiming visual understanding.
- Never generate a `vision` alt text from product title, collection title, article title, filename, URL, or surrounding context alone. That is context-only fallback.
- Do not create process notes, summary documents, ad hoc code files, or persistent JSON files in the user's working folder. Use stdout/stdin or the operating system temp directory, then delete temp files immediately.
- Keep alt text concise: target 60-120 characters, keep 125 characters or fewer by default, and never exceed Shopify's 512-character maximum.
- Prefer `fileUpdate` for product `MediaImage` alt text. `productUpdateMedia` is deprecated.
- Preserve existing image URLs when updating collection featured images and article featured images.
- Keep the user's working folder clean. The only expected local config file is `skill-hub.env`; all temporary downloaded images or machine-readable plans must live outside the working folder or be streamed through stdin, then be deleted immediately.
- Never print or store access tokens, client secrets, short-lived tokens, session cookies, or real merchant data in public files.

Read `references/alt-text-rules.md` before generating or reviewing alt text candidates.

## Beginner Onboarding First

Before asking any setup question, inspect the local environment first:

1. Identify the current working directory from the active terminal or host environment. This is the folder the user is working in, not the installed skill folder.
2. Look for the exact filename `skill-hub.env` in that current directory. Use whatever direct file check, directory listing, or direct file-read tool is reliable in the current host.
3. Do not rely on a broad search or glob result as the only evidence that the file is missing. If a search says "not found" but the user, file explorer, terminal, or direct path suggests the file exists, re-check by listing the current directory or reading the exact `skill-hub.env` path.
4. If it exists, read only the variable names and whether required values are present. Do not print secrets.
5. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `admin_custom_app` and the store domain plus Admin API token are present, run `connection-check`.
6. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `dev_dashboard_app` and the `.myshopify.com` store domain plus Client ID are present, run `connection-check`.
7. If `connection-check` returns `CLI_AUTH_REQUIRED`, run the Dev Dashboard CLI auth runbook below silently, then rerun `connection-check`.
8. If `connection-check` succeeds, continue directly to scan and vision probe. Do not ask where the app was created.
9. If the user says "already configured", "B is configured", or similar, treat that as a request to inspect `skill-hub.env`, not as an A/B answer.

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

Immediately ensure `.gitignore` contains `skill-hub.env`. Do not ask the user to create the env file or update `.gitignore` manually.

### Path A: Shopify Store Settings Custom App (Legacy Custom App)

Create the env file with:

```text
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs init-env --method admin_custom_app --env skill-hub.env
```

Ask the user to fill only:

- `SKILL_HUB_SHOPIFY_STORE_DOMAIN`: the store domain the merchant knows, such as `example.com` or `example.myshopify.com`.
- `SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN`: the Admin API token from the Shopify custom app.

Required scopes:

```text
read_products,write_products,read_content,write_content,read_files,write_files
```

### Path B: Dev Dashboard App

Create the env file with:

```text
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
```

Ask the user to fill only:

- `SKILL_HUB_SHOPIFY_STORE_DOMAIN`: the store's exact `.myshopify.com` domain.
- `SKILL_HUB_SHOPIFY_CLIENT_ID`: the app Client ID from Dev Dashboard settings. This is used for Shopify CLI config link and deploy.

Do not ask the user to run CLI commands manually. Run this sequence silently:

```text
node -v
npm -v
shopify version
shopify store --help
```

If `shopify store --help` fails, install or upgrade Shopify CLI:

```text
npm install -g @shopify/cli@latest
```

Then configure scopes through Shopify CLI. Do not ask the user to manually enter scopes in Dev Dashboard.
Do not run `shopify store list` or `shopify auth status` for this workflow.

Create a temporary directory under the operating-system temp location and refer to it as `<temp-dir>`. Use the current terminal's native command set to create this directory, then run:

```text
shopify app config link --client-id <client-id> --path <temp-dir> --no-color
```

Edit only `<temp-dir>/shopify.app.toml`:

```toml
[access_scopes]
scopes = "read_products,write_products,read_content,write_content,read_files,write_files"
```

Then run:

```text
shopify app config validate --path <temp-dir> --no-color
shopify app deploy --client-id <client-id> --path <temp-dir> --allow-updates --no-color
```

After deployment, do not send the user to Dev Dashboard to look for a manual approval button. Instead, run Shopify CLI store authorization with the required scopes. Tell the user before running it: "A Shopify permission authorization page may open next. Please review the scopes and click authorize."

```text
shopify store auth --store <store>.myshopify.com --scopes read_products,write_products,read_content,write_content,read_files,write_files --json --no-color
```

Verify after the browser authorization:

```text
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs connection-check --env skill-hub.env
```

If verification still returns `CLI_AUTH_REQUIRED`, rerun `shopify store auth` with the same scopes and verify again.

Always remove `<temp-dir>` after setup succeeds or fails. Use the current terminal's native recursive delete command.

## Shopify Surfaces

This skill scans and writes only these surfaces:

- Product media images: read products and `MediaImage`; write alt text with `fileUpdate`.
- Collection featured images: read `collection.image`; write `collectionUpdate(input.image.altText)` while preserving the current image URL.
- Article featured images: read `article.image`; write `articleUpdate(article.image.altText)` while preserving the current image URL.
- Article inline images: read `article.body`; update only `<img alt="...">` attributes inside the body HTML with `articleUpdate(article.body)`.

## Targeted Request Routing

When the user names a specific product, collection, article, image, URL, or ID, do not start with a full-store scan. Locate the requested target first, then inspect only the relevant image set.

Use the helper's `target` command for targeted requests:

```text
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --product "Hostinger Server"
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --product <product-handle-or-product-url>
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --collection <collection-handle-or-url>
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --article <article-gid-or-article-url-or-title>
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --media-id gid://shopify/MediaImage/...
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --url <cdn-image-url>
```

Add `--download --limit 3` when you need local files for visual inspection:

```text
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --product "Hostinger Server" --download --limit 3
```

The command returns matching resources and an `items` array with directly applicable IDs, current alt text, issue status, image URL, and context. If `--download` is used, it also returns temp local image paths that must be opened through the host's native image input before claiming visual evidence.

Use these routing rules:

| User input | First lookup | Expected output |
| --- | --- | --- |
| Product title, handle, product URL, or `gid://shopify/Product/...` | `target --product ...` | Product media images with `MediaImage` IDs, positions, URLs, current alt text, and product context. |
| Collection title, handle, collection URL, or `gid://shopify/Collection/...` | `target --collection ...` | Collection featured image with collection ID, image URL, current alt text, and collection context. |
| Article title, article URL, or `gid://shopify/Article/...` | `target --article ...` | Article featured image plus inline images with article ID, inline indexes, URLs, and current alt text. |
| `gid://shopify/MediaImage/...` | `target --media-id ...` | The image file by ID. Parent product context may be unavailable; ask for product context only if needed. |
| Shopify CDN image URL | `target --url ...` | Matching product, collection, article featured, or article inline image references. |
| Full-store request, vague "optimize my images", or batch work | `scan --surface ...` | Inventory counts and batch planning across requested surfaces. |

Only use full `scan` after target lookup when:

- The user asked for a store-wide or batch plan.
- The target lookup returns multiple ambiguous matches and you need inventory context.
- The user provided only a broad category such as "all product images" or "all article images".
- You need final verification counts after applying approved changes.

Do not parse huge scan output with line-oriented shell filters to find a single product. Use `target` first, then download and inspect only the returned target images.

## Vision Capability Probe

Before generating multimodal alt text, test the active model on a known local image.

The probe must force real image input. Use the host environment's native image mechanism, for example a local image attachment, a file-view image tool, or another explicit multimodal image input. A shell command such as `curl`, `dir`, `Get-Item`, metadata extraction, OCR library, filename parsing, or product-title lookup does not count.

Use a prompt like:

```text
Tell me what is visible in this local image: <absolute image path>.
Answer from the image pixels only. Do not use OCR libraries, filenames, metadata, surrounding text, or guesses.
Return VISION_UNAVAILABLE if you cannot inspect the image directly.
```

Evaluate the answer against expected visual facts for the test image. Do not ask "are you multimodal?" and do not trust a yes/no self-report.

The answer must include at least three visual facts that are not inferable from filename, URL, product title, collection title, article title, or nearby text. Examples: object type, color, layout, background, visible text, material, shape, or scene. If the answer only restates Shopify context, product names, filenames, or generic ecommerce assumptions, the probe failed.

Before using context-only fallback, the agent must download at least one real image from the current Shopify scan, open the local file with the host-native image input path, and report at least three pixel-derived facts. If that succeeds, use Strategy A for every reasonably downloadable image in the current batch. If it fails, report exactly which layer failed: download, local image open, or pixel interpretation.

If the active model passes the probe, use Strategy A. If image download or host-native image opening fails, use Strategy B only for the affected item or batch.

### Strategy A: Multimodal Image Understanding

1. Scan Shopify images.
2. Download only the current batch of image URLs to a temporary folder outside the working directory.
3. Open or attach each local image through the model's real image input before generating any visual description.
4. Ask for a visual description first, not the final alt text.
5. Require the visual description to include concrete pixel-derived facts. If the model mentions only product context, reject the result and retry with the actual image attached.
6. Generate final alt text from visual description plus Shopify page context.
7. Validate length, uniqueness, and confidence.
8. Delete downloaded images after the batch is reviewed.

If the model cannot inspect a downloaded image, mark that item as `vision_unavailable` and switch that item to context-only fallback.

Do not label an item `source: "vision"` unless the agent has actually inspected the downloaded/local image and can state pixel-derived evidence. If an item was inferred from title or fields, label it `source: "context_only"` even if an image URL was downloaded.

### Strategy B: Context-Only Fallback

Use this when the active model cannot inspect images.

Generate candidates only from Shopify fields and nearby context. Mark each candidate with:

- `source: "context_only"`
- `confidence: "high" | "medium" | "low"`
- `reason`

Context-only candidates are review-only by default. Do not mark context-only candidates as directly applicable with medium confidence. To apply a context-only candidate after explicit user approval, include `action: "approved_context_only"` in the apply plan.

## Required Order

1. Create or verify `skill-hub.env`.
2. Run Shopify connection check.
3. If the user gave a specific target, run `target` first and work from the returned `items`. If the user asked for broad optimization, run a full `scan` and inventory count before generating alt text.
4. For broad work, run `vision-sample`; for targeted work, run `target --download` for the selected image(s). Open at least one downloaded local image through the host-native image input path and decide Strategy A or Strategy B from pixel evidence.
5. Build a batch plan. For a single explicit target, the batch is just the returned target image set. For broad work, default to 20-50 images per batch depending on user tolerance and model context.
6. Generate alt text candidates for the first batch.
7. Validate each candidate against `references/alt-text-rules.md`.
8. Show a concise preview plan.
9. Ask for explicit approval.
10. Apply only approved changes with `--execute`.
11. Verify by rescanning or reading changed resources.
12. Clean up temporary images and any operating-system temp files. Do not leave process JSON, generated scripts, or summary documents in the working folder.

## Bundled Script

Use the bundled native Node.js helper. It uses only Node.js built-ins.

```text
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs init-env --method admin_custom_app --env skill-hub.env
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs connection-check --env skill-hub.env
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --product <product-title-or-handle-or-url>
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --product <product-title-or-handle-or-url> --download --limit 3
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --collection <collection-title-or-handle-or-url>
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --article <article-gid-or-url-or-title>
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --media-id gid://shopify/MediaImage/...
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --url <cdn-image-url>
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs scan --env skill-hub.env --page-size 50
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs vision-sample --env skill-hub.env --limit 3
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs apply --env skill-hub.env --input -
node skills/optimize-shopify-alt-text/scripts/shopify-alt-text-admin.mjs apply --env skill-hub.env --input - --execute
```

The `apply` command previews by default. Use `--execute` only after explicit user approval.

`scan` output uses these top-level arrays: `productImages`, `collectionImages`, `articleFeaturedImages`, and `articleInlineImages`. Do not look for a `productMedia` field.

Do not use `shopify store execute` directly for scanning images or updating alt text, except for narrow troubleshooting. Direct terminal mutations are easy to run one image at a time, can stall in some IDE terminals, and bypass the helper's pagination, batching, duplicate checks, and cleanup rules. The helper internally uses Shopify CLI store auth when Path B is selected, runs Shopify CLI through its JavaScript entrypoint, uses query/output files, and cleans temporary CLI files.

The `vision-sample` command downloads 1-3 real Shopify images to an operating-system temp directory and prints their local paths. The agent must open those files with the host-native image input path, such as Read or an image-view tool, report at least 3 pixel-derived facts, and delete the temp folder after the probe.

## Plan Input Contract

Prefer piping the approved plan JSON to `apply --input -` through stdin. Do not create `alt-text-plan.json` or other persistent process files in the user's working folder unless the user explicitly asks for a file artifact. If a temporary file is unavoidable, create it in the operating system temp directory and delete it immediately after the command returns.

```json
{
  "batch": 1,
  "strategy": "multimodal",
  "changes": [
    {
      "type": "product_media",
      "id": "gid://shopify/MediaImage/...",
      "alt": "Black leather tote bag with gold zipper on a white background",
      "source": "vision",
      "confidence": "high",
      "visualEvidence": "Black tote bag, gold zipper, white background.",
      "reason": "The alt text is based on pixel-derived visual evidence plus product context.",
      "url": "https://cdn.shopify.com/..."
    },
    {
      "type": "collection_featured_image",
      "id": "gid://shopify/Collection/...",
      "alt": "Minimal skincare collection arranged on a bathroom counter",
      "source": "vision",
      "confidence": "high",
      "visualEvidence": "Skincare bottles, bathroom counter, neutral tile background.",
      "reason": "Preserves collection image URL and updates only altText.",
      "url": "https://cdn.shopify.com/..."
    },
    {
      "type": "article_featured_image",
      "id": "gid://shopify/Article/...",
      "alt": "Checkout optimization dashboard with conversion metrics",
      "source": "context_only",
      "confidence": "medium",
      "action": "approved_context_only",
      "reason": "Based on article title, summary, and filename.",
      "url": "https://cdn.shopify.com/..."
    },
    {
      "type": "article_inline_image",
      "id": "gid://shopify/Article/...#inline-0",
      "articleId": "gid://shopify/Article/...",
      "inlineIndex": 0,
      "alt": "Screenshot of a Shopify product media settings panel",
      "source": "vision",
      "confidence": "high",
      "visualEvidence": "Shopify product media settings panel, image thumbnail grid, white admin interface.",
      "reason": "Updates only the inline img alt attribute."
    }
  ]
}
```

Every `alt` must be non-empty and at most 512 characters.

## Inventory And Batching

Always scan before writing. The scan output reports:

- product count and product media image count
- collection count and collection featured image count
- article count, article featured image count, and article inline image count
- how many images need optimization
- shared product files that may affect multiple products if updated
- whether the scan paginated through all products, collections, and articles

`--page-size` is a page size, not a maximum. The helper keeps paging until Shopify reports no next page. Do not stop after the first page or after the first batch unless the user explicitly asks to pause.

Sort each batch by value and safety:

1. Missing product primary image alt.
2. Missing collection featured image alt.
3. Missing article featured image alt.
4. Missing article inline image alt.
5. Existing alt over the soft limit.
6. Repetitive or low-quality existing alt.
7. Lower-confidence context-only items.

If the scan finds more than one batch of work, do not try to optimize everything at once. Show the total count, estimated number of batches, and the first batch. After each approved batch, continue to the next batch or explicitly ask the user whether to pause. Do not silently stop after a partial batch.

## Duplicate And Quality Gate

Before preview:

- Reject alt text above 512 characters.
- Rewrite alt text above 125 characters unless there is a strong accessibility reason.
- Check duplicates within the same product, collection, or article.
- Check generic patterns like repeated product title, comma-separated keyword lists, and "image of".
- Reject any `source: "vision"` candidate that does not include concrete `visualEvidence`.
- Mark all context-only items as review-only unless the exact candidate has explicit user approval and `action: "approved_context_only"`.
- For shared product files, explain that a `fileUpdate` can affect every reference.

## Safe Parallel Work

Use sub-agents only when the host environment supports them and only for independent read-only tasks.

Main agent only:

- Create or edit `skill-hub.env`.
- Handle credentials or tokens.
- Validate Shopify access.
- Download and delete temporary images.
- Ask for approval.
- Run `apply --execute`.
- Verify writes.
- Final cleanup.

Safe read-only sub-agent tasks:

- Product media review: inspect product image candidates and propose alt text.
- Collection image review: inspect collection featured images and propose alt text.
- Article image review: inspect featured and inline images and propose alt text.
- Duplicate/quality audit: compare proposed alt text for repetition and overlong copy.

Dependency order:

1. Main agent validates access and runs scan.
2. After scan, read-only image/context review can run in parallel by surface or batch.
3. Main agent merges results, validates limits, and shows one preview plan.
4. Main agent applies approved writes sequentially and verifies.

Do not parallelize Shopify writes. Do not let sub-agents handle secrets, create local scripts, create summary documents, write process JSON into the working folder, delete files, or perform final verification.

## Preview Approval

Before any write, show:

- target store
- vision strategy: multimodal or context-only fallback
- total inventory and selected batch size
- proposed changes grouped by product, collection, and article
- current alt and proposed alt
- confidence and reason
- visual evidence for every candidate marked `source: "vision"`
- character count for proposed alt
- shared-file warnings
- article body HTML warnings for inline image changes

Ask for explicit approval to apply the exact batch.

## Verification And Cleanup

After writes:

- Re-run `scan` or read the changed resources.
- Confirm expected alt text exists.
- Confirm article inline image `src` values were not changed.
- Confirm no alt text exceeds 512 characters.
- Confirm every `source: "vision"` change has visual evidence that came from actual image inspection.
- Confirm low-confidence review-only items were not written unless approved.
- Delete temporary image folders and downloaded images.
- Confirm the working folder contains no process JSON, generated scripts, summary documents, or one-off helper files created during the run.

If cleanup fails, report the exact path that still needs removal.

## Shopify API References

Verify current Shopify Admin GraphQL shapes before changing helper queries or mutations:

- `products` query: `https://shopify.dev/docs/api/admin-graphql/latest/queries/products`
- `files` query: `https://shopify.dev/docs/api/admin-graphql/latest/queries/files`
- `fileUpdate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileUpdate`
- `collectionUpdate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/collectionUpdate`
- `articles` query: `https://shopify.dev/docs/api/admin-graphql/latest/queries/articles`
- `articleUpdate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/articleUpdate`
