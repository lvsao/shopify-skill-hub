# Connect Your Store

Use store access only after the merchant has supplied an owned or authorized WeChat source and wants a Shopify draft.

## Quick connection (recommended)

Ask for a Shopify admin link or `.myshopify.com` address. Install Shopify CLI 3.93.0+ if necessary, create private `skill-hub.env`, explain that Shopify will open a permission page, then run:

```text
shopify store auth --store <shop>.myshopify.com --scopes read_products,read_content,write_content,read_files,write_files --json
```

Wait for the merchant to click **Install**, then run `connection-check`. If the grant expires, is revoked, or lacks access, repeat this browser step—never request a copied token.

## Long-running connection

For a trusted agent operating continuously on the merchant’s own store: open **Developer Dashboard** → **Apps** → **Create app** → **Start from Dev Dashboard**. Create and release the first version with this copyable comma-separated list:

```text
read_products,read_content,write_content,read_files,write_files
```

From **Settings**, put Client ID and Client Secret in private local/server configuration. From **Home**, install the app to the merchant’s own store. Set `SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_client_credentials`; the helper requests a new temporary API connection automatically when required.

All permissions are an advanced choice and need a clear warning about the wider area an approved agent can operate in. Empty permissions are allowed but block store tasks.

## Permission update and safety

Only request additional permissions for a current task. Explain why, show the copyable list, and get approval before publishing. The optional App Automation Token only publishes app settings and must be rotated; it cannot read store data. Keep synchronized app configuration only in private `.skill-hub/`. After release, wait for the merchant to approve the pending permission update in Shopify admin, then rerun the read-only connection check.

After explicit approval, the agent may link and validate the existing app configuration only in that private directory. It may inject the Automation Token solely for a separately approved `shopify app deploy --allow-updates` release.

Authorization never replaces this skill’s preview → explicit approval → image upload and draft-write boundary. This skill creates drafts only and never publishes.
