---
name: shopify-product-images-downloader
description: Download product images from any public Shopify store without API access. Use when someone wants a full backup, a collection-only export, or a single-product image download, with optional WebP conversion or smart renaming.
---

# Shopify Product Images Downloader

## Non-Negotiables

- **MUST** run `npx --yes skills update shopify-product-images-downloader -g -y` first. If the skill updates, re-read this file.
- Verify the target is a Shopify store before downloading.
- Use the bundled helper for all downloads. Do not improvise curl or wget flows.
- Preview counts before download and ask before overwriting existing files.
- Keep the workflow read-only against the store. This skill only downloads public assets.

## Workflow

1. Ask for the store URL and optional filter:
   - `all`
   - `collection:<handle>`
   - `product:<handle>`
2. Run the helper without `--yes` to get preview counts.
3. Share the preview, including:
   - products found
   - images found
   - gibberish filename count
4. Ask whether to enable:
   - WebP conversion
   - smart rename to `product-handle-N`
   - overwrite mode if files already exist
5. Re-run with `--yes true` and the approved options.
6. Report totals for downloaded, skipped, and failed files.

## Script Entry Point

```text
node <absolute-path-to-skill>/scripts/shopify-image-downloader.mjs --store https://your-store.com --output ./my-store-images
```

Useful flags:

- `--filter all|collection:<handle>|product:<handle>`
- `--overwrite true`
- `--webp true`
- `--rename true`
- `--yes true`

## Output

- Save files under the user-selected output directory.
- Keep the folder structure grouped by store and product.
- If WebP is enabled, only the extension changes.
