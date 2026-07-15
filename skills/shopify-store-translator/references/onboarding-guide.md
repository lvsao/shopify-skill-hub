# Connect Your Store

Ask for a Shopify admin link or `.myshopify.com` address only when translations need store access.

## Quick connection (recommended)

Check Node.js and Shopify CLI 3.93.0+, create private `skill-hub.env`, tell the merchant a Shopify permission page will open, then run:

```text
shopify store auth --store <shop>.myshopify.com --scopes read_locales,write_locales,read_markets,write_markets,read_translations,write_translations --json
```

Wait for the merchant to click **Install**, then run `connection-check`. Reopen authorization only if access expires, is revoked, or lacks the listed permissions.

## Long-running connection

For a trusted agent that continuously serves the merchant’s own store, use **Developer Dashboard** → **Apps** → **Create app** → **Start from Dev Dashboard**. In the first released version, paste this comma-separated list into the permissions field:

```text
read_locales,write_locales,read_markets,write_markets,read_translations,write_translations
```

Copy Client ID and Client Secret from **Settings** into private local/server configuration, install the app from **Home**, and set `SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_client_credentials`. The helper refreshes short-lived API access itself; do not paste secrets or access tokens into chat.

An advanced merchant may enable all permissions, but explain that it greatly enlarges what an approved agent can do. Empty permissions are allowed but block store work until updated.

## Later permissions

When an active task needs more access, show the exact copyable list and reason, then request approval. The optional App Automation Token only publishes the app configuration and expires; it is never a store-data credential. Keep synchronized app configuration only in private `.skill-hub/`. After release, the merchant must approve the app’s pending update in Shopify admin before retrying the read-only connection check.

After explicit approval, the agent may run `shopify app config link` and `shopify app config validate --json` only in that private directory. It may inject the Automation Token solely for an independently approved `shopify app deploy --allow-updates` release.

Connection never replaces preview and explicit approval before enabling languages, changing Markets, or registering translations.
