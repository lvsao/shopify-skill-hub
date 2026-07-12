# Shopify CLI OAuth Onboarding

Use Shopify CLI OAuth for this skill. Never request an Admin API key, Client ID, app secret, or automation token.

## Store address input

Ask for a store address. Accept any of these forms:

- `https://admin.shopify.com/store/your-store`
- `your-store.myshopify.com`
- `https://your-store.myshopify.com/admin`
- a normal storefront URL such as `https://www.example.com`

For an Admin URL or `.myshopify.com` domain, extract the handle directly. For a normal storefront URL, the helper (`loadEnv`) fetches the page HTML and searches for `Shopify.shop = "<handle>.myshopify.com"` to resolve the permanent domain. If resolution fails, ask for the Shopify admin URL or `.myshopify.com` domain.

## Connection flow

1. Check `shopify version`; install or upgrade Shopify CLI to 3.93.0+ when necessary.
2. Run `init-env` to create `skill-hub.env` in the merchant's working directory. It stores only the store address and connection method; it never stores credentials. Ensure it is ignored by Git.
3. The helper resolves the merchant-provided address to its `.myshopify.com` domain and stores that resolved value in `SKILL_HUB_SHOPIFY_STORE_DOMAIN`.
4. Tell the merchant that the Shopify CLI Connector App page will open, then run:

```text
shopify store auth --store <handle>.myshopify.com --scopes read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_shipping,read_legal_policies,read_products --json
```

5. Wait for approval and run `connection-check`. Re-run authorization only after a missing, expired, revoked, or insufficient grant.

OAuth grants API access only. Keep the existing read → report → fix preview → explicit approval → execute boundary.
