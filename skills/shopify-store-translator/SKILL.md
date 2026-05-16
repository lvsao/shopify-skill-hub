---
name: shopify-store-translator
description: "Translate all Shopify store resources into any target language. Use when a merchant wants to add a new language, translate products, collections, pages, blogs, policies, menus, and more, audit existing translations for outdated content, or sync translations to a Shopify market. Supports both Shopify CSV import/export and direct API translation with a preview-first, approval-based workflow."
---

# Shopify Store Translator

## Non-Negotiables

- **MUST** run `npx --yes skills update shopify-store-translator -g -y` as the **first action** on every trigger, before anything else. Do not skip, do not ask the user, do not proceed without running it. If the command fails, report the error and stop. If it succeeds or says "up to date", continue.
- **After running the update command, immediately re-read the skill's references before proceeding.** Do not use cached or stale instructions.
- **Read `references/business-field-map.md` before translating.** Map the user's business request (e.g., "translate products") to ALL related resource types. Never translate a resource type in isolation without considering nested resources (options, images, SEO fields).
- **Encoding/decoding safety (CRITICAL):** Every file written or processed must explicitly use UTF-8 encoding (`'utf8'` in Node.js). Never rely on system default encoding. When writing CSV files for Shopify import, use UTF-8 with BOM (`\uFEFF` prefix) for Windows Excel compatibility. Test that Chinese, Japanese, Korean, Arabic, and emoji characters survive round-trip encoding — re-read the file after writing to verify no garbled characters (`\uFFFD`, `�`, or mojibake). On Windows, always use `--query-file` with `--output-file` in Shopify CLI, never inline `--query` (PowerShell corrupts quotes and non-ASCII characters). After every Shopify write, verify the stored content has no encoding corruption by re-fetching the translation.
- **ALWAYS use Node.js for file I/O with non-ASCII text (CRITICAL):** For ANY file containing translations, HTML, accented characters, CJK, Arabic, or emoji — read and write exclusively through the `shopify-translator-admin.mjs` script or direct `require('fs')` calls with explicit `'utf8'` encoding. Never use PowerShell's `Set-Content`, `Out-File`, `Add-Content`, `>`, `>>`, `ConvertTo-Json`, or `ConvertFrom-Json` for files that contain non-ASCII characters — these cmdlets corrupt multi-byte characters on Windows. If you must use PowerShell, only use it to call `node script.mjs` (Node.js handles encoding correctly). This rule is cross-platform: on macOS/Linux, terminal encoding is typically UTF-8, but always use Node.js to be safe.
- **NO TRUNCATION (CRITICAL):** Every translation must be COMPLETE. Never summarize, abbreviate, truncate, or shorten the original content. The translated text must contain every sentence, every paragraph, every word of the source. SEO fields (`meta_title`, `meta_description`) must also be complete translations, not shortened summaries — if the translation exceeds the character limit, note it in the preview and discuss with the user rather than silently truncating. Product descriptions, article body_html, blog content, policy pages — every field must be translated in full without exception.
- **Read tool truncation workaround (CRITICAL):** The AI's Read tool truncates lines at 2000 characters. When you read a fetch JSON file, long fields like `body_html` will show `(line truncated to 2000 chars)` and you will NOT see the complete original text. This means you CANNOT translate the field correctly from the truncated view. After reading the fetch JSON, check each field's length via the `value.length` in the file (use `node -e` to compute it). For any field with `length > 1500`, extract the **complete** value using the `get-field` command before translating:
  ```
  node <script> get-field --input <fetch.json> --resource-id <gid> --field <key>
  ```
  Read the full output from this command — that is your source text to translate. Do NOT attempt to translate from the Read tool's truncated display.
- **Post-write verification:** After `translationsRegister` completes, immediately re-fetch `translatableResource(resourceId, translations(locale:"{locale}"))` for each written resource. Compare the stored translation `value` length with the original `value` length. If the translation is significantly shorter (< 60% of original length), flag it for review — this indicates truncation happened. Also verify no garbled/mojibake characters appear in the stored value.
- Never write translations to Shopify without explicit user approval. Always show a preview or CSV summary first.
- Never translate `handle` fields under any circumstance. Handles are Shopify URL slugs (e.g. `my-product`, `automated-collection`). Translating them breaks URLs, causes 404 errors, and damages SEO. This rule applies to all resource types: PRODUCT, COLLECTION, ARTICLE, BLOG, PAGE, and any other resource with a handle field. Leave the Translated content column empty for every handle row.
- Preserve all HTML tags when translating `body_html` fields. Translate only the text content between tags.
- Always check `userErrors` on every `translationsRegister` response. Stop and report on any error.
- Never print or store access tokens, client secrets, or real merchant data in public files.
- Keep the user's working folder clean. Delete every temporary query file, JSON output, downloaded file, and ad hoc script after the workflow completes or fails.
- The audit CSV (`translation-audit.csv`) is the primary user-facing artifact. Write it to the **current working directory** so the user can find and open it. Never write the audit CSV to the OS temp directory or system drive.
- The annotated JSON (`translation-audit.json`) is the AI's working artifact that contains both source text and translations. Keep it alongside the CSV so the CSV can be re-generated without re-translating.
- Use `{TEMP_DIR}` (OS temp directory) only for intermediate files: raw fetch JSON output, CLI query files, CLI output files. Delete all files under `{TEMP_DIR}` immediately after the write step completes or fails.
- After the task finishes, verify the working directory contains the expected artifacts: `skill-hub.env`, `translation-audit.csv`, `translation-audit.json`, and committed skill source files. Remove any stray query files, raw fetch JSON copies, or one-off helper scripts.

Read `references/translation-api.md` before executing any translation workflow.
Read `references/market-lang-setup.md` for market and language configuration workflow.
Read `references/business-field-map.md` to understand which resource types and fields are needed for each business request.

## Beginner Onboarding First

**Read `references/onboarding-guide.md` before executing any onboarding steps.** This guide is the single source of truth for all Selofy skills. Do not duplicate its instructions here.

Follow this condensed flow:

## Translation Workflow

> **Path A** uses `node ... shopify-translator-admin.mjs` commands (direct HTTP with Admin token).  
> **Path B** uses `shopify store execute --query-file` commands (Shopify CLI OAuth). All Path B GraphQL must be written to a file first — never use inline `--query` on Windows.

### Step 1: Full Language & Market Configuration Check

Use the bundled market-lang check script:

```
node skills/shopify-store-translator/scripts/shopify-market-lang-check.mjs check --target {locale} --env skill-hub.env
```

This checks:
1. Whether the locale is enabled and published
2. Whether the locale is present in any market's web presence (default or alternate)
3. Which markets are missing the locale

If the locale needs to be added/published:

**Path A:**
```
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs enable-locale --env skill-hub.env --locale {locale}
```

**Path B:** Write to `{TEMP_DIR}/enable-locale.graphql`:
```graphql
mutation { shopLocaleEnable(locale: "{locale}") { shopLocale { locale published } userErrors { message } } }
```
```
shopify store execute --store {store}.myshopify.com --allow-mutations --query-file {TEMP_DIR}/enable-locale.graphql --output-file {TEMP_DIR}/enable-out.json --no-color
```
Then write to `{TEMP_DIR}/publish-locale.graphql`:
```graphql
mutation { shopLocaleUpdate(locale: "{locale}", shopLocale: { published: true }) { shopLocale { locale published } userErrors { message } } }
```
```
shopify store execute --store {store}.myshopify.com --allow-mutations --query-file {TEMP_DIR}/publish-locale.graphql --output-file {TEMP_DIR}/publish-out.json --no-color
```

### Step 2: Full Market Configuration Check

**Path A:**
```
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs check-markets --env skill-hub.env --locale {locale}
```

**Path B:** Write to `{TEMP_DIR}/check-markets.graphql`:
```graphql
query { markets(first: 20) { nodes { id name enabled primary webPresence { id rootUrls { locale url } defaultLocale { locale } alternateLocales { locale } } } } }
```
```
shopify store execute --store {store}.myshopify.com --query-file {TEMP_DIR}/check-markets.graphql --output-file {TEMP_DIR}/markets-out.json --no-color
```

Read `references/market-lang-setup.md` for complete market/locale configuration options including:
- Adding locale to an existing market's `alternateLocales`
- Creating a new market with country regions and web presence (subfolder URLs)
- Setting locale as default for an existing market

After translation completes, present a human-readable summary:
```
Translation completed for {locale}.

Language Status:
  ✅ {locale} is enabled and published

Market Configuration:
  ✅ Market A: {locale} is DEFAULT locale
  ✅ Market B: {locale} is ALTERNATE locale
  🟢 Market C: {locale} NOT configured

For detailed tutorial: https://www.selofy.com/tutorials/shopify/shopify-international-market-translation
```

Then ask:
```
Would you like me to help configure markets for {locale}?
A - Guide me through manual setup
B - Let the agent update market configurations via API
C - I'll set it up myself later
D - Show me the tutorial at https://www.selofy.com/tutorials/shopify/shopify-international-market-translation
```

If user chooses B, use `references/market-lang-setup.md` for the exact API mutations to execute.

### Step 3: Fetch Translatable Content

**IMPORTANT — Business Completeness:** Before fetching, use `references/business-field-map.md` to determine the full scope of resources needed. For example, "translate products" means PRODUCT + PRODUCT_OPTION + PRODUCT_OPTION_VALUE + MEDIA_IMAGE. The `fetch` command automatically queries nested resources (images, options) when `--include-nested` is enabled (default: true).

**Path A:**
```
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs fetch --env skill-hub.env --resource-type PRODUCT --locale {locale} --output {TEMP_DIR}/fetch-output.json
```

**Path B:** Write to `{TEMP_DIR}/fetch.graphql`:
```graphql
query($cursor: String) {
  translatableResources(first: 50, resourceType: PRODUCT, after: $cursor) {
    nodes {
      resourceId
      translatableContent { key value digest locale }
      translations(locale: "{locale}") { key value outdated }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```
```
shopify store execute --store {store}.myshopify.com --query-file {TEMP_DIR}/fetch.graphql --output-file {TEMP_DIR}/fetch-output.json --no-color
```
Paginate by updating the `$cursor` variable until `pageInfo.hasNextPage` is false.

Supported `--resource-type` values (all 30 Shopify types):
`PRODUCT`, `PRODUCT_OPTION`, `PRODUCT_OPTION_VALUE`, `COLLECTION`, `PAGE`, `ARTICLE`, `BLOG`, `SHOP`, `SHOP_POLICY`, `LINK`, `FILTER`, `METAFIELD`, `METAOBJECT`, `MEDIA_IMAGE`, `ARTICLE_IMAGE`, `COLLECTION_IMAGE`, `EMAIL_TEMPLATE`, `DELIVERY_METHOD_DEFINITION`, `MENU`, `PAYMENT_GATEWAY`, `SELLING_PLAN`, `SELLING_PLAN_GROUP`, `PACKING_SLIP_TEMPLATE`, `ONLINE_STORE_THEME`, `ONLINE_STORE_THEME_APP_EMBED`, `ONLINE_STORE_THEME_JSON_TEMPLATE`, `ONLINE_STORE_THEME_LOCALE_CONTENT`, `ONLINE_STORE_THEME_SECTION_GROUP`, `ONLINE_STORE_THEME_SETTINGS_CATEGORY`, `ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS`

### Step 4: AI Translation — JSON Workflow (NO TRUNCATION)

**IMPORTANT: Do not generate CSV directly. Follow the JSON workflow below.**

#### 4a. Read the full original content

Read the fetch JSON output file. For every translatable field:
- If `field.value.length` (in the file, compute with `node -e`) is > 1500 characters, the Read tool truncated the display. Extract the **complete** value:
  ```
  node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs get-field --input <fetch.json> --resource-id <gid> --field <key>
  ```
  Read the full output of this command as your source text.

#### 4b. Add translations to the JSON

For each field with status `NEW` or `OUTDATED`, add two properties to the JSON:
- `translation`: the complete translated text
- Use `resourceName` for human-readable resource names

**CRITICAL: NO TRUNCATION RULES**

1. **Every word must be translated.** The translated text must contain every sentence, paragraph, and word of the source. Never use `...` or abbreviate.
2. **Compare lengths:** After adding each translation, compute `translation.length / original.length`. If < 70% (non-CJK) or < 50% (CJK), the translation is truncated — redo it in full. French text is typically 15-30% longer than English, so a French translation shorter than the English original is a red flag.
3. **SEO fields:** Translate `meta_title` and `meta_description` completely. If the full translation exceeds 70 chars (title) or 160 chars (description), include the full translation and note the limit issue in the preview. Do NOT silently truncate.
4. **HTML preservation:** For `body_html` fields: preserve all HTML tags (including all attributes), translate only text content between tags. Verify that every `<` tag from the original appears in the translation.
5. **Non-translatable:** Do not translate: `handle` fields, brand names, product model numbers, URLs, Liquid variables.
6. **Encoding safety:** All translations must be valid UTF-8. Use Node.js `fs.writeFileSync(path, JSON.stringify(data), 'utf8')` to save the annotated JSON. **Never use PowerShell** `Set-Content` or `ConvertTo-Json` for files with accented/CJK characters — these corrupt non-ASCII data on Windows.

#### 4c. Write the annotated JSON

Save the annotated JSON to a file (e.g. `translation-audit.json`). Use only Node.js for the file write:
```javascript
const fs = require('fs');
fs.writeFileSync('translation-audit.json', JSON.stringify(data, null, 2), 'utf8');
```
Verify the written file is valid JSON and contains no garbled characters:
```
node -e "const d=JSON.parse(require('fs').readFileSync('translation-audit.json','utf8')); console.log('OK, resources:', d.resources.length)"
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs check-encoding --file translation-audit.json
```

#### 4d. Generate the audit CSV (for user review)

Run the `generate-audit` command to produce `translation-audit.csv` from the annotated JSON:
```
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs generate-audit --input translation-audit.json --locale {locale}
```

This command:
- Reads the annotated JSON
- Generates `translation-audit.csv` with all fields
- Reports a summary: X NEW, Y OUTDATED, Z CURRENT, any length warnings
- Does NOT write to Shopify

#### 4e. Verify the CSV encoding

Run encoding check on the generated CSV:
```
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs check-encoding --file translation-audit.csv
```

Present the summary to the user:
- X fields to translate (NEW)
- Y fields to update (OUTDATED)
- Z fields skipped (CURRENT/SKIPPED)
- Any length-ratio warnings (translation < 70% of original for non-CJK, < 50% for CJK)

### Step 5: User Review and Approval

Show the CSV summary from Step 4d. Tell the user:
```
translation-audit.csv has been generated. Please review the translations.
Type APPROVE to write all translations to Shopify, or tell me which items to change.
```

Do not proceed until the user explicitly approves. Do NOT write anything to Shopify before approval.

### Step 6: Write Translations (after user approval)

Only proceed after receiving explicit user approval. Use the `write` command with the audit CSV:
```
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs write --env skill-hub.env --input translation-audit.csv --locale {locale}
```

**Path B:** For each resource in the CSV, write a mutation file to `{TEMP_DIR}/write-batch-{n}.graphql` and execute:
```
shopify store execute --store {store}.myshopify.com --allow-mutations --query-file {TEMP_DIR}/write-batch-{n}.graphql --output-file {TEMP_DIR}/write-out-{n}.json --no-color
```
Check each output file for `userErrors`. Stop and report on any error.

### Step 7: Verify Written Translations

After all writes complete, verify the stored translations on Shopify:

**Path A:**
For each written resource, re-query its translations:
```
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs fetch --env skill-hub.env --resource-type {TYPE} --locale {locale} --output {TEMP_DIR}/verify-output.json
```
Read `{TEMP_DIR}/verify-output.json` and for each translation:
1. Check the stored `value` has no garbled characters (mojibake). Look for `???` replacement characters, broken multi-byte sequences, or unexpected `\uFFFD` replacement characters.
2. Compare stored translation length vs original length. If translation length < 60% of original, flag it as truncated and re-translate.
3. Confirm `userErrors` list is empty.

**Path B:**
Write to `{TEMP_DIR}/verify-translations.graphql`:
```graphql
query($resourceId: ID!) {
  translatableResource(resourceId: $resourceId) {
    resourceId
    translatableContent { key value digest locale }
    translations(locale: "{locale}") { key value outdated }
  }
}
```
Execute for each written resource and perform the same checks as Path A.

### Step 8: Market Configuration Reminder

After all verifications pass, present the market configuration summary:

1. Run the market-lang check again to get current state:
```
node skills/shopify-store-translator/scripts/shopify-market-lang-check.mjs check --target {locale} --env skill-hub.env
```
2. From the output, present the human-readable summary showing:
   - Whether the locale is enabled and published
   - Which markets serve this locale
   - Which markets are missing the locale
3. Ask if the user wants help configuring markets (follow steps in `references/market-lang-setup.md`)

### Step 9: Cleanup

1. Delete all files under `{TEMP_DIR}` (fetch JSON, CLI query/out files) immediately after write completes or fails.
2. **Do not delete `translation-audit.csv`** — this is the primary user-facing artifact for review and record.
3. **Keep `translation-audit.json`** — this is the annotated JSON with all source content and translations. It can be used to re-generate the CSV without re-translating.
4. Re-scan the working directory for leftovers before finishing:
   - Keep: `skill-hub.env`, `translation-audit.csv`, `translation-audit.json`, committed skill source files
   - Delete: any stray query.graphql, variables.json, or one-off helper scripts the agent created
5. If cleanup fails, tell the user the exact path that still needs removal.

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
shopify-translator-admin.mjs init-env             --method admin_custom_app|dev_dashboard_app --env skill-hub.env
shopify-translator-admin.mjs connection-check     --env skill-hub.env
shopify-translator-admin.mjs check-locales        --env skill-hub.env --target {locale}
shopify-translator-admin.mjs enable-locale        --env skill-hub.env --locale {locale}
shopify-translator-admin.mjs check-markets        --env skill-hub.env --locale {locale}
shopify-translator-admin.mjs add-locale-to-market --env skill-hub.env --market-web-presence-id {id} --locale {locale}
shopify-translator-admin.mjs fetch                --env skill-hub.env --resource-type {TYPE} --locale {locale} --output {file}
shopify-translator-admin.mjs write                --env skill-hub.env --input {csv} --locale {locale}
shopify-translator-admin.mjs generate-audit       --input {annotated.json} --locale {locale} [--output {audit.csv}]
shopify-translator-admin.mjs get-field            --input {fetch.json} --resource-id {gid} --field {key}
shopify-translator-admin.mjs verify-translations  --env skill-hub.env --locale {locale} [--input {csv}]
shopify-translator-admin.mjs check-encoding       --file {path}
shopify-market-lang-check.mjs check               --target {locale} --env skill-hub.env
shopify-market-lang-check.mjs validate-setup      --target {locale} --env skill-hub.env
```

## CSV Import/Export Translation Workflow

Shopify Admin allows merchants to export all translatable content as a CSV and re-import after editing. This skill supports this path as an alternative to the API-based workflow.

### When to use CSV import/export

- The merchant already has a Shopify-exported CSV file
- Bulk translation of all resource types at once (the export includes everything)
- Offline review and editing before import
- Faster for stores with many resource types

### How to export from Shopify

Shopify Admin → Settings → Languages → select target language → **Export** → download CSV

### CSV format (Shopify standard)

```
Type,Identification,Field,Locale,Market,Status,Default content,Translated content
PRODUCT,'123456,title,de,,,My Product,
COLLECTION,'789,title,de,,,My Collection,
```

Column meanings:
- `Type`: Resource type (PRODUCT, COLLECTION, ARTICLE, MEDIA_IMAGE, etc.)
- `Identification`: Resource ID (prefixed with `'` to prevent Excel from treating as number)
- `Field`: Field key (title, body_html, handle, alt, etc.)
- `Locale`: Target language code (de, fr, it, es, etc.)
- `Market`: Optional market ID for market-specific translations. Empty = global.
- `Status`: Translation status from Shopify. Empty = not yet translated.
- `Default content`: Source text in the store's primary language
- `Translated content`: Target translation. **Fill this column.**

### Translation rules for CSV mode

The Shopify CSV has 8 columns: `Type, Identification, Field, Locale, Market, Status, Default content, Translated content`

**The only column to fill is `Translated content`.** Never modify any other column.

#### Decision framework: translate or skip?

**Rule 1 — Always skip regardless of content:**

| Condition | Reason |
|---|---|
| `Field` = `handle` | URL slug — causes 404 if translated |
| `Default content` starts with `{{` or `{%` | Liquid code — not user-visible text |
| `Default content` starts with `shopify://` | Internal Shopify URL |
| `Default content` is a bare URL (`https://...`) | External URL — do not translate |
| `Type` = `PACKING_SLIP_TEMPLATE` | Mixed HTML+Liquid system template |
| `Type` = `METAOBJECT`, `Field` = `data` | JSON structured data |
| `Type` = `DELIVERY_METHOD_DEFINITION`, `Field` = `description`, value is a carrier code (e.g. `usps`, `dhl_express`) | System identifier |
| `Translated content` already filled | Preserve existing translation |

**Rule 2 — Translate by content type (API `LocalizableContentType`):**

When using the API path, fetch `translatableContent.type` and apply:

| `type` value | Action |
|---|---|
| `SINGLE_LINE_TEXT_FIELD`, `MULTI_LINE_TEXT_FIELD`, `STRING`, `RICH_TEXT_FIELD`, `INLINE_RICH_TEXT`, `LIST_SINGLE_LINE_TEXT_FIELD`, `LIST_MULTI_LINE_TEXT_FIELD` | ✅ Translate as plain text |
| `HTML` | ✅ Translate — preserve all HTML tags, translate text nodes only |
| `URI`, `URL`, `LINK`, `LIST_URL`, `LIST_LINK` | ⛔ Skip — URL/link fields |
| `JSON`, `JSON_STRING` |  Skip — structured data |
| `FILE_REFERENCE`, `LIST_FILE_REFERENCE` | ⛔ Skip — file references |

**Rule 3 — For CSV path (no `type` field available), use content pattern detection:**

| Pattern | Action |
|---|---|
| Contains `{{` or `{%` anywhere | ⛔ Skip (Liquid) |
| Starts with `shopify://` or `https://` or `http://` | ⛔ Skip (URL) |
| Is valid HTML (contains `<` and `>`) but also contains `{{` |  Skip (HTML+Liquid mixed) |
| Is valid HTML (contains `<` and `>`) with no Liquid | ✅ Translate — preserve tags |
| Plain text (no `<`, no `{`) | ✅ Translate |
| Looks like a slug (`only-lowercase-hyphens-and-numbers`) |  Skip |
| Looks like a price (`$10`, `$25`) | ⛔ Skip |

#### Per-Type field rules (from CSV analysis)

**ONLINE_STORE_THEME** — translate row-by-row using Rule 3:
- ✅ Translate: `*.text`, `*.label`, `*.title` fields containing plain text or pure HTML
- ⛔ Skip: `*.link` fields (contain `shopify://` or `https://` URLs)
- ⛔ Skip: any field where value contains `{{` or `{%`
- Examples to translate: "Join our email list", "Cart", "View all", "Continue shopping", "Shop all", "Welcome to our store"
- Examples to skip: `{{ article.title }}`, `shopify://collections/all`, `https://www.facebook.com/`

**COOKIE_BANNER** — all `preferences_*` fields are plain text, translate all:
- ✅ Translate: `title`, `text`, `button_*_text`, `preferences_*` (all user-visible text)
- ⛔ Skip: `policy_link_url` (URL field)

**METAFIELD** — value field only, apply Rule 3:
- ✅ Translate if plain text or pure HTML
-  Skip if JSON, URL, or contains Liquid

**METAOBJECT**:
- ✅ Translate: `label`, `title` (plain text)
-  Skip: `data` (JSON string)

**ARTICLE**:
- ✅ Translate: `title`, `meta_title`, `meta_description`, `summary_html` (preserve HTML tags)
- ✅ Translate: `body_html` — preserve all HTML tags and attributes, translate text nodes only
- ⛔ Skip: `handle`

**MEDIA_IMAGE / ARTICLE_IMAGE / COLLECTION_IMAGE**:
- ✅ Translate: `alt` — translate the description text
- ⛔ Skip if `alt` is empty or looks like a filename

**PRODUCT_OPTION_VALUE**:
- ⛔ Skip if value is a price (`$10`, `$25`, `$50`, `$100`)
- ✅ Translate all other option values (colors, sizes, materials)

**DELIVERY_METHOD_DEFINITION**:
- ✅ Translate: `name` (human-readable shipping method name)
- ⛔ Skip: `description` if value is a carrier code (`usps`, `dhl_express`, `fedex`)

**SHOP_POLICY / PAGE body_html**:
- ✅ Translate text nodes, preserve HTML structure
- ⛔ Skip Liquid variables (`{{ last_updated }}`, `{{ shop_name }}`) — leave them as-is in the translated output

**PACKING_SLIP_TEMPLATE**:
- ⛔ Skip entirely — complex HTML+Liquid system template

### Using the script for CSV translation

```
node <user-home>/.agents\skills\shopify-store-translator\scripts\shopify-translator-admin.mjs translate-csv \
  --input /path/to/shopify-export.csv \
  --output /path/to/translated.csv \
  --locale de
```

The script reads the Shopify-exported CSV, applies all skip rules, translates matching rows using the AI agent, and writes the output CSV ready for import.

For rows the script cannot translate automatically (long HTML articles, complex metafields), the agent should translate them inline and fill the `Translated content` column directly.

### How to import back to Shopify

Shopify Admin → Settings → Languages → select target language → **Import** → upload the translated CSV

Shopify will validate the file and apply all filled `Translated content` values. Rows with empty `Translated content` are ignored.

### Encoding Safety for CSV

- **Always write CSV with UTF-8 encoding**: Use Node.js `writeFileSync(path, content, 'utf8')`. On Windows, prepend UTF-8 BOM (`\uFEFF`) to the file for Excel compatibility: `writeFileSync(path, '\uFEFF' + content, 'utf8')`.
- **Verify non-ASCII characters**: After writing the CSV, read it back and check that Chinese, Japanese, Arabic, accented, and emoji characters are not garbled. Look for `\uFFFD` (replacement character) or `�` in the re-read content. If found, the encoding was corrupted — rewrite with explicit UTF-8.
- **Cross-platform**: PowerShell `Out-File` defaults to UTF-16 on some Windows versions. Never rely on PowerShell redirection (`>`) or `Out-File` without explicit `-Encoding utf8`. Use Node.js file writes instead.
- **BOM for import**: Shopify import requires UTF-8 with BOM for proper character detection. Always prefix CSV files with BOM when they will be imported through Shopify Admin.

### NO TRUNCATION for CSV

- Every row with translatable content must have the **complete** translation in the `Translated content` column.
- After filling all translations, compare the length of `Default content` vs `Translated content` for each row.
- If any `Translated content` is significantly shorter than `Default content` (< 80% length for non-CJK, < 60% for CJK), the translation is likely truncated. Re-translate the row in full.
- The `Translated content` column must contain every word, sentence, and paragraph from `Default content` in the target language. No summaries, no abbreviations.

### Common import errors

| Error | Cause | Fix |
|---|---|---|
| "Invalid file format" | CSV encoding not UTF-8 | Save as UTF-8 with BOM |
| "Digest mismatch" | Source content changed after export | Re-export and re-translate |
| "Unknown resource" | Deleted resource ID in CSV | Remove that row |
| Translated content not showing | Locale not published | Publish locale in Settings → Languages |
| Garbled characters in storefront | Encoding mismatch or truncated content | Re-export, re-translate, verify encoding |
