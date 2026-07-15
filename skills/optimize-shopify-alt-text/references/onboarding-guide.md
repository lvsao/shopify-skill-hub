# Connect Your Store

Offer a connection only when store data or an approved update is needed. Ask for a Shopify admin link or `.myshopify.com` address; accept a normal storefront URL only when the helper can safely resolve its permanent Shopify address.

## Choice 1 — Quick connection (recommended)

This is best for a first try or a one-off task. The merchant provides no secret.

1. Check Shopify CLI 3.93.0+ and install or upgrade it if necessary.
2. Create the private working-directory `skill-hub.env` with `init-env`; it stores the store address and chosen method, never a CLI token.
3. Say: “A Shopify permission page is opening. Please review it and click Install; I will continue when it finishes.”
4. Run:

```text
shopify store auth --store <shop>.myshopify.com --scopes read_products,write_products,read_content,write_content,read_files,write_files --json
```

5. Run `connection-check`. If access expires, is revoked, or lacks a needed permission, repeat this browser step. Never ask the merchant to copy an access token.

## Choice 2 — Long-running connection

Use this only for the merchant’s own store and a trusted local or server agent. It lets the agent request a fresh short-lived connection automatically; the Client Secret remains private.

1. In Shopify admin, open the store switcher/name menu and choose **Developer Dashboard**. Labels can vary slightly by admin version.
2. Choose **Apps** → **Create app** → **Start from Dev Dashboard**, name the app, then open **Versions** and create the first version.
3. In the permissions field, enter this exact copyable list. Shopify asks for a comma-separated list:

```text
read_products,write_products,read_content,write_content,read_files,write_files
```

4. Set the app URL to Shopify’s default app home if no app page is needed, then **Release** the version.
5. In **Settings**, copy the Client ID and Client Secret directly into private configuration. Do not paste either into chat, source code, or a repository.
6. From **Home**, choose **Install app**, select the merchant’s own store, and approve the installation.
7. Set `SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_client_credentials` plus the store domain, Client ID, and Client Secret in `skill-hub.env`, or provide the same values as private server environment variables. The helper requests and refreshes temporary API access automatically.

Advanced merchants may choose all permissions, but explain that it gives any approved agent a much larger operating area. Empty permissions are allowed, but the app cannot do store work until permissions are added.

## Adding a permission later

Only request a permission required by the active task. Show the exact copyable list and reason, then get explicit approval before changing app configuration.

For controlled automation, first synchronize the existing app configuration only inside private `.skill-hub/`; never do this in the Skills repository. `SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN` is optional and only permits Shopify CLI to publish that app’s configuration—it cannot access store data. It expires and must be rotated.

After the merchant explicitly approves synchronization, the agent may run `shopify app config link --path <private-.skill-hub-app-dir> --client-id <client-id>`, then `shopify app config validate --path <private-.skill-hub-app-dir> --json`. After separately approving the exact scope release, inject the Automation Token only for `shopify app deploy --path <private-.skill-hub-app-dir> --allow-updates`. Never run these commands from the Skills repository or expose their secret values.

After a release, tell the merchant to open the app in Shopify admin and approve the pending permission update. Wait for that confirmation, then rerun the read-only connection check. Do not assume a newly released permission works immediately.

## Safety and recovery

- Connection never replaces the existing preview → explicit approval → `apply --execute` rule.
- If long-running connection reports `DEV_DASHBOARD_STORE_NOT_PERMITTED`, the app and store are not in the same Shopify organization; use quick connection instead.
- If it reports `SCOPE_UPDATE_REQUIRED`, show the listed permissions and follow the approval flow. Do not silently broaden access.
- Keep all secrets in private local/server configuration. Never display them in commands, reports, logs, or committed files.
