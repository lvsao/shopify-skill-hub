# Onboarding

Offer three clear paths.

## 1. Quick connection (recommended for store changes)

Ask for a Shopify admin link or `.myshopify.com` address, install Shopify CLI 3.93.0+ if needed, create private `skill-hub.env`, then open the permission page directly:

```text
shopify store auth --store <shop>.myshopify.com --scopes read_products,write_products,read_files,write_files --json
```

Wait for the merchant to click **Install**, then run `connection-check`. Re-authorize only when the CLI grant is missing, expired, revoked, or insufficient.

## 2. Long-running connection

For a trusted local/server agent on the merchant’s own store: open **Developer Dashboard** → **Apps** → **Create app** → **Start from Dev Dashboard**. In the first version, enter this copyable comma-separated scope list and release it:

```text
read_products,write_products,read_files,write_files
```

Copy Client ID and Client Secret from **Settings** into private configuration, install the app from **Home**, and set `SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_client_credentials`. The helper automatically requests a fresh short-lived connection when needed. Do not paste Client Secret or temporary access tokens into chat.

Advanced merchants may enable all permissions, but clearly explain the increased risk. Empty permissions are allowed but cannot perform store work.

## 3. Read-only website review

No login or credentials. Use `public_storefront` and a storefront/product URL. Generate a report only; never offer writes.

## Permission update and recovery

Request additional permissions only for the active task and only after showing a copyable list and obtaining approval. The optional Automation Token is only for publishing app configuration; it cannot access store data and must be rotated. Store the synchronized app configuration only under private `.skill-hub/`. After release, the merchant approves the pending update in Shopify admin, then the agent reruns `connection-check`.

After explicit approval, the agent may link and validate the existing app only under private `.skill-hub/`; after a separate release approval it may inject the Automation Token solely for `shopify app deploy --path <private-.skill-hub-app-dir> --allow-updates`.

Every connected mode still requires preview → explicit approval → `apply --execute`; read-only mode never writes.
