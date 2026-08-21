---
name: shopify-barcode-generator
description: Generate local GTIN-14 barcode numbers for preview, audit missing Shopify variant barcodes, and apply an explicitly approved CSV preview. Use for Shopify barcode preparation and missing-barcode cleanup; it is not for GS1 or strict-channel identifiers.
slug: shopify-barcode-generator
displayName: Shopify Barcode Generator
version: 1.1.0
author: Selofy (lvsao)
license: MIT
platforms: [macos, linux, windows]
metadata:
  openclaw:
    requires:
      bins: [node]
    envVars:
      SKILL_HUB_SHOPIFY_ACCESS_METHOD:
        required: false
        description: "Optional: shopify_cli_oauth (default) or dev_dashboard_client_credentials."
      SKILL_HUB_SHOPIFY_STORE_DOMAIN:
        required: false
        description: "Shopify admin URL or .myshopify.com domain for scan and approved write-back."
      SKILL_HUB_SHOPIFY_API_VERSION:
        required: false
        description: "Optional Shopify Admin API version override."
      SKILL_HUB_SHOPIFY_CLIENT_ID:
        required: false
        description: "Dev Dashboard Client ID for a long-running private connection."
      SKILL_HUB_SHOPIFY_CLIENT_SECRET:
        required: false
        description: "Private Dev Dashboard Client Secret."
      SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN:
        required: false
        description: "Optional token for separately approved app permission releases only."
      SKILL_HUB_SHOPIFY_CLI_JS:
        required: false
        description: "Optional path to the Shopify CLI JavaScript launcher."
    emoji: 🏷️
    homepage: https://github.com/lvsao/shopify-skill-hub
  hermes:
    tags: [Shopify, GTIN, Barcode, GMC, Feed]
    category: productivity
---

# Shopify Barcode Generator

Generate 1–500 GTIN-14 values with the existing `0 + 03 + 10 random digits + check digit` format. The generation algorithm, random source, and 500-item limit are fixed.

> Not GS1-licensed. Synthetic GTIN-14 for GMC custom and other tolerant channels etc. only. Not for Amazon or other strict GTIN channels that require GS1-verified codes.

## Use the right mode

- **Generate:** no Shopify access. Use for a local list or CSV.
- **Scan:** read-only store scan. It creates an HTML summary and a review CSV only for variants with an empty barcode.
- **Apply:** reads the approved CSV again, rechecks every variant and barcode, writes only with `--execute`, then verifies the stored value.

Read `references/gtin-rules.md` before generating. Read `references/onboarding-guide.md` only when store access is needed.

## Commands

```text
node <skill>/scripts/shopify-barcode-generator.mjs generate --count 20 --out barcodes.csv
node <skill>/scripts/shopify-barcode-generator.mjs init-env --store <shop>.myshopify.com --env skill-hub.env
node <skill>/scripts/shopify-barcode-generator.mjs connection-check --env skill-hub.env
node <skill>/scripts/shopify-barcode-generator.mjs scan --env skill-hub.env --out gap-report.html --csv gap-preview.csv --limit 200
node <skill>/scripts/shopify-barcode-generator.mjs apply --env skill-hub.env --input gap-preview.csv
node <skill>/scripts/shopify-barcode-generator.mjs apply --env skill-hub.env --input approved.csv --execute --out apply-results.csv
```

`barcodes.csv` begins with the standard `barcode` header. The disclaimer is printed in the terminal and included in the HTML report; it is deliberately not inserted as a non-CSV comment line.

## Store workflow

1. Use `init-env`, then complete the read-only `connection-check` with `read_products`.
2. Run `scan`. It reads all products and variants, skips every existing barcode when generating candidates, and writes a maximum of 500 rows.
3. Review `gap-preview.csv`. Change only intended rows from `approved=false` to `approved=true`.
4. Run `apply` without `--execute` to inspect the row count. Obtain explicit merchant approval before the next command.
5. Run `apply --execute`. It blocks changed variants, duplicate barcodes, invalid GTIN-14 values, and product/variant mismatches; it then uses Shopify `productVariantsBulkUpdate` and verifies the result.

The input CSV columns are: `productId`, `variantId`, `product`, `variant`, `sku`, `existingBarcode`, `proposedBarcode`, `action`, `approved`. `action=create` is emitted by scan. `overwrite` is accepted only when `existingBarcode` exactly matches the current store value.

### Connection errors

Only after a request fails; keep the selected access method.

- Network (`fetch failed`, `ETIMEDOUT`, `ECONNRESET`, `ENETUNREACH`): never guess proxy ports. If the runtime is configured to use an approved proxy, retry once; otherwise ask the merchant to expose one to this process.
- `407`: fix proxy credentials in the runtime secret store; never paste them in chat.
- `CLI_NOT_FOUND` / `ENOENT`: resolve the configured CLI entry or platform command; this is a launcher error.
- `401/403` / `invalid_client`: check store, credentials, and app installation.
- `SCOPE_UPDATE_REQUIRED`: show missing scopes, get approval, approve in Shopify, refresh token, retry.
- `shop_not_permitted`: use an app permitted for this store; do not loop. GraphQL errors: fix query/input; do not retry blindly.
- Suggest another access method only after this path fails and the user agrees.
