# Shopify CLI OAuth Onboarding

Connect this skill with Shopify CLI OAuth. Do not request an Admin API key, Client ID, app secret, or automation token.

1. Ask for a Shopify admin URL or `.myshopify.com` domain; normalize it to `<handle>.myshopify.com`.
2. Check `node --version` and `shopify version`. Install Node.js and Shopify CLI 3.93.0+ if either is unavailable.
3. Create private working-directory `skill-hub.env` containing only:

```text
SKILL_HUB_SHOPIFY_ACCESS_METHOD=shopify_cli_oauth
SKILL_HUB_SHOPIFY_STORE_DOMAIN=<handle>.myshopify.com
```

4. Tell the merchant that a Shopify CLI Connector App permission page will open, then run:

```text
shopify store auth --store <handle>.myshopify.com --scopes read_locales,write_locales,read_markets,write_markets,read_translations,write_translations --json
```

5. Wait for approval, then run `connection-check`. Shopify CLI retains the local OAuth grant; re-authorize only if it is missing, expired, revoked, or lacks these scopes.

Always show the translation candidate preview and obtain explicit approval before enabling a locale, changing a Market, or registering translations.
