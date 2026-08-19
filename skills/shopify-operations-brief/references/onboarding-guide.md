# Shopify Operations Brief onboarding

Keep `skill-hub.env` in the merchant's working directory, outside this repository, and never commit it. Choose one access method deliberately; the script never guesses or falls back.

## 1. Quick connection — Shopify CLI OAuth

This is the default for an interactive merchant or developer session. Shopify CLI opens the browser authorization flow and runs the read-only queries.

```env
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_ACCESS_METHOD=shopify_cli_oauth
SKILL_HUB_SHOPIFY_SCOPES=read_orders,read_products,read_inventory
# Optional when `shopify` is not on PATH:
# SKILL_HUB_SHOPIFY_CLI_PATH=/absolute/path/to/shopify
```

## 2. Long-running connection — Dev Dashboard credentials

Use a merchant-owned Dev Dashboard app only when an interactive browser session is unsuitable. The script exchanges the credentials in memory for one short-lived token and never saves or prints it.

```env
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_client_credentials
SKILL_HUB_SHOPIFY_CLIENT_ID=your_client_id
SKILL_HUB_SHOPIFY_CLIENT_SECRET=your_client_secret
```

## 3. Explicit local token — BYOK/testing

Use only when the merchant has intentionally created an Admin API token for this local read-only run. This mode does not activate because a token happens to exist in the environment.

```env
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_api_access_token
SKILL_HUB_SHOPIFY_ACCESS_TOKEN=your_admin_api_access_token
```

For this repository's isolated test environment, `SHOPIFY_TEST_STORE_DOMAIN` and `SHOPIFY_ADMIN_API_ACCESS_TOKEN` are supported only when `admin_api_access_token` is explicitly selected. Never copy those values into public files.

## Read-only access needed

Start with `read_orders,read_products,read_inventory`. These are Shopify's names for read-only access to orders, products, and inventory. Some stores also need approved access before Shopify allows abandoned-checkout data. If that happens, the script stops with `SCOPE_UPDATE_REQUIRED`; it never adds access, publishes an app version, or approves anything for the merchant.

## API version and console encoding

The default Admin API version is `2026-07`. Set `SKILL_HUB_SHOPIFY_API_VERSION` only to a currently supported stable version. The script rejects a response that falls forward to another version, so upgrade deliberately rather than accepting schema drift.

On Windows terminals that render Chinese incorrectly, run `chcp 65001` before the command. Generated HTML already uses UTF-8.
