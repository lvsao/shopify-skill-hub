# Connect Your Store

Ask for a Shopify admin link or `.myshopify.com` address only when this audit needs Admin data or an approved fix. Normalize the address before connecting.

## Quick connection (recommended)

1. Ensure Shopify CLI 3.93.0+ is installed.
2. Create private `skill-hub.env` with `init-env`; it stores only the method and store address.
3. Tell the merchant a Shopify permission page will open, then run:

```text
shopify store auth --store <shop>.myshopify.com --scopes read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_shipping,read_legal_policies,read_products --json
```

4. Wait for **Install**, then run `connection-check`. Reopen the browser authorization only when it expires, is revoked, or lacks access.

## Long-running connection

For a trusted agent working continuously on the merchant’s own store, guide them through **Developer Dashboard** → **Apps** → **Create app** → **Start from Dev Dashboard**. In the first app version, enter this copyable, comma-separated permission list:

```text
read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_shipping,read_legal_policies,read_products
```

Release the version, copy Client ID and Client Secret from **Settings** into private local/server configuration, then install the app from **Home** to the merchant’s own store. Set `SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_client_credentials`. The helper refreshes short-lived access automatically; never save or paste that temporary access token.

All permissions are an advanced option only. Explain that it expands what an approved agent could do. Leaving permissions empty is allowed but prevents store work until they are added.

## Permission updates and safety

Only propose a new permission for the active task, show the exact list and reason, and obtain approval before release. `SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN` is optional: it only lets Shopify CLI publish this app’s settings and expires periodically; it never reads store data.

Synchronize app configuration only in private `.skill-hub/`, never in the Skills repository. After release, the merchant must approve the app’s pending permission update in Shopify admin; then rerun `connection-check`. Keep the audit’s read → report → preview → explicit approval → execute boundary.

After explicit approval, the agent may use `shopify app config link --path <private-.skill-hub-app-dir> --client-id <client-id>`, validate that private configuration, and—after a separate scope-release approval—run `shopify app deploy --path <private-.skill-hub-app-dir> --allow-updates` with the Automation Token injected only for that command.
