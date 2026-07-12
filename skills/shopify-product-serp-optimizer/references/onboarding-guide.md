# Onboarding

Present exactly two choices to the merchant:

---

## Option 1 — Connect store (recommended)

Full Shopify CLI OAuth access. Read SERP data and apply approved changes.

### 1. Get a store address

Accept any of these forms:

- `https://admin.shopify.com/store/your-store`
- `your-store.myshopify.com`
- `https://your-store.myshopify.com/admin`
- A plain storefront URL such as `https://www.example.com`

#### Resolve the permanent Shopify domain

- For an Admin URL or `.myshopify.com` domain, extract the handle directly.
- For a plain storefront URL, the helper fetches the page HTML and searches for `Shopify.shop = "<handle>.myshopify.com"` to resolve the permanent domain. The merchant does not need to do this manually.
- If resolution fails, tell the merchant the domain could not be identified and ask for the Shopify admin URL or `.myshopify.com` domain. Never guess a domain and never ask for an API key as a fallback.

### 2. Connection flow

1. Check `shopify version`. If Shopify CLI is missing, run `npm install -g @shopify/cli@latest` to install. If below 3.93.0, upgrade with the same command.
2. Run `init-env`:
   ```text
   node <skill-path>/scripts/shopify-product-serp-admin.mjs init-env --method shopify_cli_oauth --env skill-hub.env
   ```
3. Tell the merchant: "A Shopify permission page is opening in your browser. Review the requested permissions and click Install. I'll wait here until it finishes."
4. **Run the authorization directly.** Do not ask the merchant to copy a token or run a second terminal command:
   ```text
   shopify store auth --store <handle>.myshopify.com --scopes read_products,write_products,read_files,write_files --json
   ```
5. Wait for the command to exit. Shopify CLI stores the OAuth authorization locally for later `shopify store execute` calls.
6. Run `connection-check`. On success, proceed to audit and preview workflow.

---

## Option 2 — Read-only mode

No login, no keys. Just provide a store URL or product URL. Generates a read-only HTML report. No writes.

1. Ask the merchant for a storefront URL or a product URL.
2. Run `init-env`:
   ```text
   node <skill-path>/scripts/shopify-product-serp-admin.mjs init-env --method public_storefront --env skill-hub.env
   ```
3. `connection-check` tests the public JSON endpoint for accessibility.
4. On success, proceed to analysis and generate a read-only HTML report. No write operations are offered.

---

## Hard rules

- Never request an API key, Client ID, app secret, or automation token.
- OAuth grants API access only, not write approval. Keep the existing preview → explicit merchant approval → `apply --execute` boundary.
- If authorization is missing, expired, revoked, or lacks required permissions, rerun `shopify store auth` with the exact scopes above.
- If the CLI is missing, classify as `CLI_NOT_FOUND`. If browser authorization does not complete, report `CLI_AUTH_REQUIRED` and retry only after the merchant is ready.
- Read-only mode never writes.
