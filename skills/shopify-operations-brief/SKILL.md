---
name: "shopify-operations-brief"
slug: "shopify-operations-brief"
version: "1.0.2"
displayName: "Shopify Operations Brief"
description: "Create a read-only Shopify store performance overview for a day, week, month, or valid custom period. Use it to review sales, orders, promotions, shipping speed, low stock on products that sold, and upcoming seasonal preparation; never use it to change store data, campaigns, or themes."
license: MIT
metadata:
  skill_hub:
    slug: "shopify-operations-brief"
    display_name: "Shopify Operations Brief"
    author: "Selofy (lvsao)"
    platforms: [macos, linux, windows]
    required_environment_variables:
      - name: SKILL_HUB_SHOPIFY_STORE_DOMAIN
        prompt: "Provide the Shopify .myshopify.com admin domain."
        help: "Store it only in a private working-directory skill-hub.env file."
        required_for: "Read-only Shopify store performance reports."
  openclaw:
    requires:
      env:
        - SKILL_HUB_SHOPIFY_STORE_DOMAIN
      bins:
        - node
    envVars:
      SKILL_HUB_SHOPIFY_STORE_DOMAIN:
        required: true
        description: "HTTPS <store>.myshopify.com domain used for read-only Shopify reports."
      SKILL_HUB_SHOPIFY_ACCESS_METHOD:
        required: false
        description: "Connection mode: shopify_cli_oauth (default), dev_dashboard_client_credentials, or admin_api_access_token."
      SKILL_HUB_SHOPIFY_API_VERSION:
        required: false
        description: "Stable Shopify Admin API version override; defaults to 2026-07."
      SKILL_HUB_SHOPIFY_SCOPES:
        required: false
        description: "Comma-separated Shopify CLI OAuth scopes; defaults to read_orders,read_products,read_inventory."
      SKILL_HUB_SHOPIFY_CLI_PATH:
        required: false
        description: "Optional Shopify CLI executable path for shopify_cli_oauth mode."
      SKILL_HUB_SHOPIFY_CLIENT_ID:
        required: false
        description: "Dev Dashboard Client ID, used only by dev_dashboard_client_credentials."
      SKILL_HUB_SHOPIFY_CLIENT_SECRET:
        required: false
        description: "Dev Dashboard Client Secret, used only by dev_dashboard_client_credentials."
      SKILL_HUB_SHOPIFY_ACCESS_TOKEN:
        required: false
        description: "Private Admin API token, used only by explicitly selected admin_api_access_token mode."
      SHOPIFY_TEST_STORE_DOMAIN:
        required: false
        description: "Local Selofy test-store compatibility variable; never commit its value."
      SHOPIFY_ADMIN_API_ACCESS_TOKEN:
        required: false
        description: "Local Selofy test-token compatibility variable; only used by explicitly selected admin_api_access_token mode."
    primaryEnv: SKILL_HUB_SHOPIFY_STORE_DOMAIN
    emoji: "📊"
    homepage: "https://github.com/lvsao/shopify-skill-hub"
  hermes:
    tags: [Shopify, Ecommerce, Analytics, Operations]
    category: operations
---

# Shopify Store Performance Overview

Generate a clear, self-contained HTML report from read-only Shopify Admin data. It shows sales, orders, products customers often buy together, how often discounts are used, shipping speed, low stock on products sold this period, and upcoming seasonal preparation.

## Safety boundaries

- This skill performs no Shopify mutations, scope releases, theme changes, campaign sends, or inventory updates.
- Treat store data, customer-linked order data, and generated reports as private. Do not paste them into public channels.
- Accept only an HTTPS `<store>.myshopify.com` domain. The script validates DNS before sending credentials and rejects unsafe destinations.
- The selected `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is authoritative. Never fall back to another mode or another token after it fails.
- Stop on a GraphQL, scope, pagination, API-version, or data-completeness error. Never render missing data as zero.
- Run reports from the merchant's working directory, not inside this source repository. HTML output stays in that directory; `--json` writes no file.

## Read first

- `references/onboarding-guide.md` for connection choice, minimum scopes, and local setup.
- `references/metric-definitions.md` for what each number means, its limits, and the data used.
- `references/marketing-calendar.md` for the seasonal-advisory rules.
- `references/design-tokens.md` only when changing the dashboard design.

## Connection choices

1. `shopify_cli_oauth` is the default interactive mode. It opens Shopify CLI authorization and uses the CLI for read-only GraphQL requests.
2. `dev_dashboard_client_credentials` is for a merchant-owned long-running connection using Client ID and Client Secret. Its short-lived token is held only in memory.
3. `admin_api_access_token` is an explicit local BYOK/testing mode. It never activates automatically.

Use the smallest read-only access set that supports the run: `read_orders,read_products,read_inventory`. If Shopify says additional protected-data access is needed, explain why, obtain merchant approval, and resolve it in Shopify before retrying.

## Commands

```text
# Create a private template without overwriting an existing file.
node <absolute-path-to-skill>/scripts/shopify-operations-brief.mjs init-env --env skill-hub.env

# Read-only connection check.
node <absolute-path-to-skill>/scripts/shopify-operations-brief.mjs connection-check --env skill-hub.env

# Default seven-day store performance report.
node <absolute-path-to-skill>/scripts/shopify-operations-brief.mjs diagnose --env skill-hub.env --lang zh-CN

# A valid custom period and a reviewable output path.
node <absolute-path-to-skill>/scripts/shopify-operations-brief.mjs diagnose --env skill-hub.env --period "2026-07-01..2026-07-31" --output reports/july-brief.html

# JSON only: no HTML file is created.
node <absolute-path-to-skill>/scripts/shopify-operations-brief.mjs diagnose --env skill-hub.env --json
```

Pass `--force` only when the merchant has reviewed and approved replacing the specified existing HTML report.

## Required order

1. Confirm the merchant selected a connection method and saved private values in `skill-hub.env`.
2. Run `connection-check` using that same file.
3. Confirm the requested timeframe; default to the previous seven completed calendar days in the shop timezone.
4. Run `diagnose`; it reads all relevant orders, abandoned checkouts, and products, and stops rather than using incomplete results.
5. Review the plain-language sales, shipping, stock, and next-step summary before opening or sharing the private report.

### Connection errors

Only after a request fails; keep the selected access method.

- Network (`fetch failed`, `ETIMEDOUT`, `ECONNRESET`, `ENETUNREACH`): never guess proxy ports. If the runtime is configured to use an approved proxy, retry once; otherwise ask the merchant to expose one to this process.
- `407`: fix proxy credentials in the runtime secret store; never paste them in chat.
- `CLI_NOT_FOUND` / `ENOENT`: resolve the configured CLI entry or platform command; this is a launcher error.
- `401/403` / `invalid_client`: check store, credentials, and app installation.
- `SCOPE_UPDATE_REQUIRED`: show the exact missing access and reason, get merchant approval for a scope change, have the merchant approve the pending update in Shopify, refresh the connection, then rerun a read-only check.
- `shop_not_permitted`: use an app permitted for this store; do not loop. GraphQL errors: fix query/input; do not retry blindly.
- Suggest another access method only after this path fails and the user agrees.
