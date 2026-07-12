# Shopify CLI OAuth Onboarding

Use this path for this skill's Shopify access. Do not ask for an API key, Client ID, app secret, or Dev Dashboard token.

1. Ask for the Shopify admin URL or `.myshopify.com` domain. Normalize `https://admin.shopify.com/store/<handle>` to `<handle>.myshopify.com`.
2. Run `shopify version`; install or upgrade Shopify CLI if it is below 3.93.0.
3. Create `skill-hub.env` in the merchant's working directory with:

```text
SKILL_HUB_SHOPIFY_ACCESS_METHOD=shopify_cli_oauth
SKILL_HUB_SHOPIFY_STORE_DOMAIN=<handle>.myshopify.com
```

4. Explain that the Shopify CLI Connector App permission page will open. Then run:

```text
shopify store auth --store <handle>.myshopify.com --scopes read_products,read_content,write_content,read_files,write_files --json
```

5. Wait for browser approval, then run the skill's lightweight connection check:

```text
node <absolute-path-to-skill>/scripts/shopify-blog-admin.mjs connection-check --env skill-hub.env
```

Shopify CLI stores the OAuth authorization locally. Some CLI displays omit read scopes that are implied by the matching write scope, so use the connection check and the later read-only context command to verify effective access. Re-authorize when access is missing, expired, revoked, or an operation reports insufficient access. This authorizes API access; it never replaces the skill's preview → explicit approval → draft-write boundary.
