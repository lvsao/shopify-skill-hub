---
name: shopify-store-translator
description: Translate Shopify store resources (Products, Collections, Pages, Blogs, and more) from the store's primary language into one or more target languages. Use when a merchant wants to add a new language, translate all products or a specific resource type, audit existing translations for outdated content, or sync translations to a Shopify market. Follows a preview-first workflow: fetch → AI translate → CSV audit → user approval → write to Shopify.
---

# Shopify Store Translator

## Non-Negotiables

- Before setup or task work, silently run `npx --yes skills update shopify-store-translator -g -y`. Do not ask whether to check or update. Continue if it reports up to date or updates successfully. Mention it only if the command fails.
- Never write translations to Shopify without explicit user approval. Always show a preview or CSV summary first.
- Never translate `handle` fields by default. Handles are URL slugs — translating them can break URLs and SEO. Only translate handles if the user explicitly requests it and understands the implications.
- Preserve all HTML tags when translating `body_html` fields. Translate only the text content between tags.
- Always check `userErrors` on every `translationsRegister` response. Stop and report on any error.
- Never print or store access tokens, client secrets, or real merchant data in public files.
- Do not create process notes, summary documents, or persistent JSON files in the user's working folder. Use the OS temp directory for transient files and delete them immediately after use.
- The only default local config artifact is `skill-hub.env`.

Read `references/translation-api.md` before executing any translation workflow.

## Beginner Onboarding First

Before asking any setup question, inspect the local environment:

1. Identify the current working directory.
2. Look for `skill-hub.env` in that directory.
3. If it exists, read variable names and check whether required values are present. Do not print secrets.
4. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app` and token is present → run connection check.
5. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app` and client ID is present → run connection check. If it returns `CLI_AUTH_REQUIRED`, run the Path B CLI runbook silently.
6. If connection check succeeds → proceed directly to the requested task.

Ask the setup question only when `skill-hub.env` is missing, incomplete, or access method is unknown:

```
Where did you create your Shopify app?

A - Shopify store Settings custom app (Legacy Custom App)
B - Dev Dashboard app
```

Immediately add `skill-hub.env` to `.gitignore` if the project has one.

### Path A: Store Settings Custom App

Create env file:
```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs init-env --method admin_custom_app --env skill-hub.env
```

Ask user to fill:
- `SKILL_HUB_SHOPIFY_STORE_DOMAIN`: store domain, e.g. `example.myshopify.com`
- `SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN`: Admin API token from Shopify store Settings → Apps → Develop apps

Required scopes:
```
read_locales, write_locales, read_markets, write_markets, read_translations, write_translations, read_products, read_content
```

Connection check:
```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs connection-check --env skill-hub.env
```

### Path B: Dev Dashboard App

Create env file:
```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
```

Ask user to fill:
- `SKILL_HUB_SHOPIFY_STORE_DOMAIN`: exact `.myshopify.com` domain
- `SKILL_HUB_SHOPIFY_CLIENT_ID`: Client ID from Dev Dashboard app settings

Then run this runbook silently (do not ask user to run commands):

1. Check CLI: `node -v`, `npm -v`, `shopify version`, `shopify store --help`
2. If CLI missing or < 3.93.0: `npm install -g @shopify/cli@latest`
3. Create temp dir under OS temp location
4. Link app: `shopify app config link --client-id {CLIENT_ID} --path {TEMP_DIR} --no-color`
5. Write scopes into `{TEMP_DIR}/shopify.app.toml`:
   ```
   scopes = "read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_products,read_content"
   ```
6. Deploy: `shopify app deploy --client-id {CLIENT_ID} --path {TEMP_DIR} --allow-updates --no-color`
7. Notify user: "A Shopify authorization page will open in your browser. Please review the scopes and click Authorize."
8. Auth: `shopify store auth --store {store}.myshopify.com --scopes "read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_products,read_content" --no-color`
9. Verify: `shopify store execute --store {store}.myshopify.com --query "query { shop { name } }" --no-color`
10. If verify returns `CLI_AUTH_REQUIRED`: rerun step 8
11. Delete temp dir

**Critical CLI rules for Path B (especially on Windows):**
- Always use `--query-file` instead of inline `--query "..."` — Windows PowerShell parses quotes and breaks the command
- Always use `--output-file` to get clean JSON — CLI stdout contains ANSI color codes that break JSON parsing
- Always include `--allow-mutations` for write operations
- Always run `shopify app deploy` before `shopify store auth`

## Translation Workflow

### Step 1: Language Check

Run:
```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs check-locales --env skill-hub.env --target {locale}
```

This queries `shopLocales` and reports:
- Store primary language
- Whether target locale exists and is published
- Action needed: none / enable / publish

If locale needs to be added or published, confirm with user, then:
```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs enable-locale --env skill-hub.env --locale {locale}
```

### Step 2: Market Check

Run:
```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs check-markets --env skill-hub.env --locale {locale}
```

This queries `markets` and reports which markets have the target locale in their `webPresence.alternateLocales`. Confirm with user which markets should serve the new language, then:
```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs add-locale-to-market --env skill-hub.env --market-web-presence-id {id} --locale {locale}
```

### Step 3: Fetch Translatable Content

```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs fetch --env skill-hub.env --resource-type PRODUCT --locale {locale} --output {TEMP_DIR}/fetch-output.json
```

Supported `--resource-type` values: `PRODUCT`, `COLLECTION`, `PAGE`, `ARTICLE`, `BLOG`, `SHOP`, `SHOP_POLICY`, `PRODUCT_OPTION`, `PRODUCT_OPTION_VALUE`, `MENU`, `LINK`, `METAFIELD`, `SELLING_PLAN`, `SELLING_PLAN_GROUP`, `PAYMENT_GATEWAY`, `DELIVERY_METHOD_DEFINITION`

The output JSON contains each resource with:
- `resourceId`: GID
- `fields`: array of `{ key, value, digest, status }` where status is `NEW`, `OUTDATED`, or `CURRENT`

### Step 4: AI Translation

Read the fetch output. For each field with status `NEW` or `OUTDATED`:
- Translate `value` from the store's primary language to the target language
- For `body_html` fields: preserve all HTML tags, translate only text content
- Do not translate: `handle` fields, brand names, product model numbers, URLs
- Keep SEO fields (`meta_title`, `meta_description`) within character limits: title ≤ 70 chars, description ≤ 160 chars

Generate a CSV audit table at `{TEMP_DIR}/translation-audit.csv` with columns:
`resource_id, resource_type, name_en, field_key, original, translation_{locale}, status, digest`

Present a summary to the user:
- X fields to translate (NEW)
- Y fields to update (OUTDATED)
- Z fields skipped (CURRENT)

### Step 5: User Review and Approval

Show the CSV summary. Ask:
```
Please review the translations above (or open the CSV file for full details).
Type APPROVE to write all translations to Shopify, or tell me which items to change.
```

Do not proceed until the user explicitly approves.

### Step 6: Write Translations

```
node skills/shopify-store-translator/scripts/shopify-translator-admin.mjs write --env skill-hub.env --input {TEMP_DIR}/translation-audit.csv --locale {locale}
```

The script batches up to 5 resources per GraphQL request using aliases, checks `userErrors` on every response, and reports a final success/failure count.

### Step 7: Cleanup

Delete `{TEMP_DIR}/fetch-output.json` and `{TEMP_DIR}/translation-audit.csv` immediately after write completes or fails.

## Resource Priority

Translate by default (HIGH):
- `PRODUCT`, `PRODUCT_OPTION`, `PRODUCT_OPTION_VALUE`
- `COLLECTION`
- `PAGE`
- `ARTICLE`, `BLOG`
- `SHOP`, `SHOP_POLICY`
- `LINK` (manual navigation links), `FILTER`
- `METAFIELD`, `METAOBJECT`
- `MEDIA_IMAGE`, `ARTICLE_IMAGE`, `COLLECTION_IMAGE`
- `EMAIL_TEMPLATE`
- `DELIVERY_METHOD_DEFINITION`

Translate only when user requests (MEDIUM):
- `MENU`
- `PAYMENT_GATEWAY`
- `SELLING_PLAN`, `SELLING_PLAN_GROUP`
- `PACKING_SLIP_TEMPLATE`
- `ONLINE_STORE_THEME`
- `ONLINE_STORE_THEME_APP_EMBED`
- `ONLINE_STORE_THEME_JSON_TEMPLATE`
- `ONLINE_STORE_THEME_LOCALE_CONTENT`
- `ONLINE_STORE_THEME_SECTION_GROUP`
- `ONLINE_STORE_THEME_SETTINGS_CATEGORY`
- `ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS`

## Script Commands Reference

```
shopify-translator-admin.mjs init-env          --method admin_custom_app|dev_dashboard_app --env skill-hub.env
shopify-translator-admin.mjs connection-check  --env skill-hub.env
shopify-translator-admin.mjs check-locales     --env skill-hub.env --target {locale}
shopify-translator-admin.mjs enable-locale     --env skill-hub.env --locale {locale}
shopify-translator-admin.mjs check-markets     --env skill-hub.env --locale {locale}
shopify-translator-admin.mjs add-locale-to-market --env skill-hub.env --market-web-presence-id {id} --locale {locale}
shopify-translator-admin.mjs fetch             --env skill-hub.env --resource-type {TYPE} --locale {locale} --output {file}
shopify-translator-admin.mjs write             --env skill-hub.env --input {csv} --locale {locale}
```
