# Shopify CLI OAuth Onboarding

This skill connects stores only through Shopify CLI OAuth. Never ask for an Admin API token, a Partner account, a Client ID, an app secret, or an automation token.

## What the merchant provides

Ask only for a store address. Accept any of these forms:

- `https://admin.shopify.com/store/your-store`
- `your-store.myshopify.com`
- `https://your-store.myshopify.com/admin`
- a normal storefront URL such as `https://www.example.com`

The agent must normalize an Admin URL or `.myshopify.com` input to `your-store.myshopify.com`. For a normal storefront URL, the helper may inspect public HTML for the permanent Shopify domain. If it cannot identify one, ask for the Shopify admin URL or `.myshopify.com` domain. Never guess a domain and never request a key as a fallback.

## Connection flow

1. Check `shopify version`.
2. If Shopify CLI is missing, explain that it will be installed to connect the store, then run `npm install -g @shopify/cli@latest`.
3. If the installed CLI is older than 3.93.0 or does not include `shopify store auth`, upgrade it with the same command.
4. Create `skill-hub.env` in the user working directory with `init-env`. It stores only the chosen store address and the connection method; it never stores credentials. Ensure it is ignored by Git.
5. Resolve the merchant-provided address to its `.myshopify.com` domain and store that resolved value in `SKILL_HUB_SHOPIFY_STORE_DOMAIN`.
6. Tell the merchant: “A Shopify permission page is opening in your browser. Review the requested permissions and click Install. I’ll wait here until it finishes.”
7. Run the authorization directly. Do not ask the merchant to copy a token or run a second terminal command:

```text
shopify store auth --store <shop>.myshopify.com --scopes read_products,write_products,read_content,write_content,read_files,write_files --json
```

8. Wait for the command to exit. Shopify CLI stores the online OAuth authorization locally for later `shopify store execute` calls.
9. Run the helper’s read-only `connection-check`. On success, continue to the audit and preview workflow.

## Safety and recovery

- OAuth authorizes store access only. It does not authorize any write proposed by this skill. Keep the existing preview → explicit merchant approval → `apply --execute` boundary.
- If authorization is missing, expired, revoked, or lacks the required permissions, rerun `shopify store auth` with this skill’s exact scopes.
- If the CLI is missing, classify the failure as `CLI_NOT_FOUND`.
- If the browser authorization does not complete, report `CLI_AUTH_REQUIRED` and retry only after the merchant is ready.
- If a requested field or mutation is denied after authentication, report `CLI_ACCESS_DENIED`; do not silently broaden scopes.
- Do not use `shopify app config link`, Dev Dashboard app configuration, custom apps, or any API-token workflow.

## Helper commands

```text
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs init-env --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs connection-check --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs target --env skill-hub.env --product "Example Product"
node <absolute-path-to-skill>/scripts/shopify-alt-text-admin.mjs scan --env skill-hub.env --page-size 50
```

The helper must run all Admin GraphQL through Shopify CLI’s stored OAuth authorization. It must keep temporary query, variable, and output files in the operating-system temp directory and delete them immediately.
