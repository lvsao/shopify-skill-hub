# Shopify Store Translator — Skill PRD

**Version:** 1.1 (updated after live simulation)
**API Version:** 2026-04 (latest stable)
**Official Docs Base:** https://shopify.dev/docs/api/admin-graphql/2026-04

---

## 1. Skill Overview

Translates Shopify store resources from the primary language into one or more target languages. Workflow:

1. Check language and market configuration
2. Fetch all translatable content via API
3. AI translates content
4. Generate CSV audit table for user review
5. User approves → write translations to Shopify

---

## 2. Environment Configuration (skill-hub.env)

**Path A — Store Settings Custom App:**
```
SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
```

**Path B — Dev Dashboard App:**
```
SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id
```

Required Admin API scopes (both paths):
```
read_locales, write_locales, read_markets, write_markets,
read_translations, write_translations, read_products, read_content
```

> For Path A vs Path B comparison (token types, CLI requirements, OAuth flow, AI Agent friendliness),
> refer to shopify-skill-creator onboarding references.

---

## 3. Onboarding Runbook

### Path A: Direct HTTP (shpat_ token)

No CLI required. All API calls use:
```
POST https://{store}.myshopify.com/admin/api/2026-04/graphql.json
Headers:
  Content-Type: application/json
  X-Shopify-Access-Token: {SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN}
```

Connection check:
```graphql
query { shop { name id } }
```
If response contains shop.name → connected. Proceed.

### Path B: Shopify CLI (Dev Dashboard App)

**Step 1: Verify CLI**
```
shopify version          # Must be >= 3.93.0
shopify store --help     # Must show store commands
```
If missing: `npm install -g @shopify/cli@latest`

**Step 2: Create temp dir and link app**
```
shopify app config link --client-id {CLIENT_ID} --path {TEMP_DIR} --no-color
```

**Step 3: Write required scopes into shopify.app.toml**
```toml
[access_scopes]
scopes = "read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_products,read_content"
```

**Step 4: Deploy config**
```
shopify app deploy --client-id {CLIENT_ID} --path {TEMP_DIR} --allow-updates --no-color
```

**Step 5: Store auth (triggers browser popup — user must approve)**
```
shopify store auth --store {store}.myshopify.com --scopes "read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_products,read_content" --no-color
```
Notify user: "A Shopify authorization page will open in your browser. Please review and click Authorize."

**Step 6: Verify**
```
shopify store execute --store {store}.myshopify.com --query "query { shop { name } }" --no-color
```

**Step 7: Cleanup temp dir after setup**

### CLI Execution Rules (Path B — Critical)

**RULE 1: Always use --query-file, never inline --query on Windows**

On Windows PowerShell, inline `--query "..."` fails due to quote parsing. Always write the GraphQL to a file first:
```powershell
Set-Content "$tmp\query.graphql" 'query { shop { name } }'
shopify store execute --store {store} --query-file "$tmp\query.graphql" --no-color
```

**RULE 2: Always use --output-file for JSON parsing**

CLI stdout contains ANSI color codes even with --no-color on stderr. Pipe to ConvertFrom-Json will fail.
Always use --output-file to get clean JSON:
```powershell
shopify store execute --store {store} --query-file "$tmp\q.graphql" --output-file "$tmp\out.json" --no-color
$data = Get-Content "$tmp\out.json" | ConvertFrom-Json
```

**RULE 3: --allow-mutations required for write operations**
```
shopify store execute --store {store} --allow-mutations --query-file "$tmp\mutation.graphql" --no-color
```

**RULE 4: deploy before auth**
Always run `shopify app deploy` before `shopify store auth`. Auth uses the scopes declared in the deployed config.

---

## 4. Language (Locale) API

### 4.1 Query: shopLocales

**Scope:** read_locales
**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/queries/shopLocales

```graphql
query {
  shopLocales {
    locale     # BCP 47 code: "en", "de", "it", "fr", "es", "zh-CN"
    primary    # Boolean. Only one locale is primary (store authoring language)
    published  # Boolean. True = visible to customers on storefront
  }
}
```

Agent logic:
- Target locale exists + published:true → proceed to translation
- Target locale exists + published:false → call shopLocaleUpdate to publish
- Target locale missing → call shopLocaleEnable, then shopLocaleUpdate

### 4.2 Mutation: shopLocaleEnable

**Scope:** write_locales
**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/shopLocaleEnable

```graphql
mutation {
  shopLocaleEnable(locale: "es") {
    shopLocale { locale published }
    userErrors { field message }
  }
}
```
Note: published is always false after enable. Must follow with shopLocaleUpdate.

### 4.3 Mutation: shopLocaleUpdate

**Scope:** write_locales
**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/shopLocaleUpdate

```graphql
mutation {
  shopLocaleUpdate(locale: "es", shopLocale: { published: true }) {
    shopLocale { locale published }
    userErrors { field message }
  }
}
```

---

## 5. Markets API

### 5.1 Query: markets

**Scope:** read_markets
**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/queries/markets

```graphql
query {
  markets(first: 10) {
    nodes {
      id       # GID: "gid://shopify/Market/123"
      name     # "Europe", "United States", "Canada"
      enabled  # Boolean
      primary  # Boolean. Primary market = merchant home market
      webPresence {
        id     # GID: "gid://shopify/MarketWebPresence/456"
        rootUrls {
          locale  # Which locale this URL serves
          url     # "https://store.myshopify.com/de/"
        }
        defaultLocale {
          locale     # Default language for this market
          primary
          published
        }
        alternateLocales {
          locale     # Additional languages in this market
          primary
          published
        }
      }
    }
  }
}
```

Field notes:
- webPresence: null means the market has no dedicated URL structure (common for primary market)
- alternateLocales: languages accessible via locale-prefixed URLs (e.g. /de/, /fr/)
- defaultLocale: language shown without a locale prefix in this market

### 5.2 Mutation: marketWebPresenceUpdate

**Scope:** write_markets
**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/marketWebPresenceUpdate

```graphql
mutation {
  marketWebPresenceUpdate(
    webPresenceId: "gid://shopify/MarketWebPresence/456"
    webPresence: {
      alternateLocales: ["fr", "de", "it", "es"]
    }
  ) {
    market {
      webPresence {
        alternateLocales { locale }
      }
    }
    userErrors { field message }
  }
}
```

CRITICAL: alternateLocales REPLACES the full list. Always read current list first and include all existing locales plus the new one.

### 5.3 URL Structure Best Practices

| Pattern | Example | When |
|---|---|---|
| Root | store.com/ | Primary market, default locale |
| Locale subfolder | store.com/de/ | Alternate locale |
| Market+locale | store.com/en-ca/ | Market-specific locale |

Use subfolder URLs (not subdomains) unless merchant has specific requirements.

---

## 6. Translation API

### 6.1 Query: translatableResources

**Scope:** read_translations
**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/queries/translatableResources

```graphql
query($cursor: String) {
  translatableResources(first: 50, resourceType: PRODUCT, after: $cursor) {
    nodes {
      resourceId   # GID: "gid://shopify/Product/123"
      translatableContent {
        key     # "title", "body_html", "meta_title", etc.
        value   # Source content in primary language
        digest  # SHA-256 hash — REQUIRED for translationsRegister
        locale  # Source locale, e.g. "en"
      }
      translations(locale: "de") {
        key
        value    # Existing translated value
        outdated # True = source changed after translation was written
        updatedAt
      }
    }
    pageInfo {
      hasNextPage
      endCursor  # Pass as $cursor for next page
    }
  }
}
```

Field notes:
- digest: Must be passed exactly as translatableContentDigest in translationsRegister. If source changes, digest changes and existing translation becomes outdated.
- outdated: true means translation still displays but may be inaccurate. Flag for re-translation.
- Paginate until hasNextPage: false.

Agent status classification:
- translations empty → NEW
- translations present + outdated:false → CURRENT (skip unless forced)
- translations present + outdated:true → OUTDATED (needs update)

### 6.2 Query: translatableResource (single)

**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/queries/translatableResource

```graphql
query {
  translatableResource(resourceId: "gid://shopify/Product/123") {
    resourceId
    translatableContent { key value digest locale }
    translations(locale: "de") { key value outdated }
  }
}
```

### 6.3 Mutation: translationsRegister

**Scope:** write_translations
**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/translationsRegister

```graphql
mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
  translationsRegister(resourceId: $resourceId, translations: $translations) {
    translations { key value locale outdated market { id name } }
    userErrors { field message }
  }
}
```

Variables:
```json
{
  "resourceId": "gid://shopify/Product/123",
  "translations": [
    {
      "locale": "de",
      "key": "title",
      "value": "Mein Produkt",
      "translatableContentDigest": "abc123...",
      "marketId": null
    }
  ]
}
```

TranslationInput fields:
- locale: Target language code (required)
- key: Field key matching translatableContent.key (required)
- value: Translated text. Preserve HTML tags for body_html fields. (required)
- translatableContentDigest: Must match digest from translatableContent (required)
- marketId: If set, translation only applies to that market. Null = global.

Batching with GraphQL aliases (multiple resources per HTTP request, max 5 recommended):
```graphql
mutation {
  p1: translationsRegister(resourceId: "gid://shopify/Product/1", translations: [...]) {
    translations { key value } userErrors { message }
  }
  p2: translationsRegister(resourceId: "gid://shopify/Product/2", translations: [...]) {
    translations { key value } userErrors { message }
  }
}
```

### 6.4 Mutation: translationsRemove

**Scope:** write_translations
**Ref:** https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/translationsRemove

```graphql
mutation {
  translationsRemove(
    resourceId: "gid://shopify/Product/123"
    translationKeys: ["title", "body_html"]
    locales: ["de"]
  ) {
    translations { key locale }
    userErrors { field message }
  }
}
```

### 6.5 Translation Object Fields

Ref: https://shopify.dev/docs/api/admin-graphql/2026-04/objects/Translation

| Field | Type | Description |
|---|---|---|
| key | String! | Field identifier |
| locale | String! | Language code |
| value | String | Translated content. Null if removed. |
| outdated | Boolean! | True if source changed after translation |
| updatedAt | DateTime | Last write time |
| market | Market | Market-specific if set. Null = global. |

---

## 7. Translatable Resource Types

Ref: https://shopify.dev/docs/api/admin-graphql/2026-04/enums/TranslatableResourceType

### 7.1 Complete List (30 types)

| Resource Type | Description | Priority |
|---|---|---|
| PRODUCT | Product listings | HIGH |
| PRODUCT_OPTION | Option names (Color, Size) | HIGH |
| PRODUCT_OPTION_VALUE | Option values (Red, Large) | HIGH |
| COLLECTION | Product collections | HIGH |
| PAGE | Online store pages | HIGH |
| ARTICLE | Blog articles | HIGH |
| BLOG | Blog containers | HIGH |
| SHOP | Store name and description | HIGH |
| SHOP_POLICY | Privacy, refund, terms | HIGH |
| MENU | Navigation menus | MEDIUM |
| LINK | Menu items | MEDIUM |
| METAFIELD | Custom metafield values | MEDIUM |
| METAOBJECT | Custom metaobject entries | MEDIUM |
| FILTER | Collection filter labels | MEDIUM |
| PAYMENT_GATEWAY | Payment method names | MEDIUM |
| DELIVERY_METHOD_DEFINITION | Shipping method names | MEDIUM |
| SELLING_PLAN | Subscription plan names | MEDIUM |
| SELLING_PLAN_GROUP | Subscription group names | MEDIUM |
| EMAIL_TEMPLATE | Transactional emails | LOW |
| PACKING_SLIP_TEMPLATE | Packing slips | LOW |
| MEDIA_IMAGE | Product image alt text | LOW |
| ARTICLE_IMAGE | Article image alt text | LOW |
| COLLECTION_IMAGE | Collection image alt text | LOW |
| ONLINE_STORE_THEME | Theme content | LOW |
| ONLINE_STORE_THEME_APP_EMBED | App embed blocks | LOW |
| ONLINE_STORE_THEME_JSON_TEMPLATE | Theme JSON templates | LOW |
| ONLINE_STORE_THEME_LOCALE_CONTENT | Theme locale strings | LOW |
| ONLINE_STORE_THEME_SECTION_GROUP | Theme section groups | LOW |
| ONLINE_STORE_THEME_SETTINGS_CATEGORY | Theme settings categories | LOW |
| ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS | Theme settings data | LOW |

### 7.2 Default Scope

**Translate by default (HIGH):**
PRODUCT, PRODUCT_OPTION, PRODUCT_OPTION_VALUE, COLLECTION, PAGE, ARTICLE, BLOG, SHOP, SHOP_POLICY, LINK, FILTER, METAFIELD, METAOBJECT, MEDIA_IMAGE, ARTICLE_IMAGE, COLLECTION_IMAGE, EMAIL_TEMPLATE, DELIVERY_METHOD_DEFINITION

**Translate only when user requests (MEDIUM):**
MENU, PAYMENT_GATEWAY, SELLING_PLAN, SELLING_PLAN_GROUP, PACKING_SLIP_TEMPLATE, ONLINE_STORE_THEME, ONLINE_STORE_THEME_APP_EMBED, ONLINE_STORE_THEME_JSON_TEMPLATE, ONLINE_STORE_THEME_LOCALE_CONTENT, ONLINE_STORE_THEME_SECTION_GROUP, ONLINE_STORE_THEME_SETTINGS_CATEGORY, ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS

Never translate handle fields by default — they are URL slugs.

### 7.3 PRODUCT Keys Reference

| Key | Type | Notes |
|---|---|---|
| title | Plain text | Product name |
| body_html | HTML | Preserve all HTML tags |
| handle | Plain text | URL slug. Do NOT translate by default. |
| product_type | Plain text | Category label |
| meta_title | Plain text | SEO title (max 70 chars) |
| meta_description | Plain text | SEO description (max 160 chars) |

---

## 8. CSV Audit Table Format

### 8.1 Column Specification

| Column | Description |
|---|---|
| resource_id | Full GID, e.g. `gid://shopify/Product/123` |
| resource_type | PRODUCT, COLLECTION, etc. |
| resource_name | Human-readable name in source language |
| field_key | title, body_html, meta_title, etc. |
| original | Source content in primary language |
| translation_{locale} | AI translation. One column per target locale. |
| status | NEW / UPDATE / OUTDATED / CURRENT |
| digest | SHA-256 from API — required for write step |

### 8.2 HTML Field Rules

- Preserve all HTML tags
- Translate only text content between tags
- Do not translate HTML attributes, class names, URLs in href/src

---

## 9. Agent Workflow

```
Step 1: LANGUAGE CHECK
  Query shopLocales → identify primary locale
  For each target locale:
    Missing → shopLocaleEnable + shopLocaleUpdate(published:true)
    Exists + unpublished → shopLocaleUpdate(published:true)
    Exists + published → proceed

Step 2: MARKET CHECK
  Query markets(first:10)
  For each target market:
    Read webPresence.alternateLocales
    If target locale missing → marketWebPresenceUpdate
    (Include ALL existing alternateLocales + new one)
    Confirm with user before updating

Step 3: FETCH CONTENT
  For each resource type, query translatableResources with pagination
  Include translations(locale:"{target}") to check existing state
  Classify: NEW / OUTDATED / CURRENT
  Skip CURRENT unless user forces re-translate

Step 4: AI TRANSLATE
  Translate NEW and OUTDATED fields
  Preserve HTML for body_html
  Do not translate: handles, brand names (unless instructed)
  Generate CSV audit table

Step 5: USER REVIEW
  Present CSV summary (X new, Y updates, Z skipped)
  Wait for explicit approval

Step 6: WRITE
  translationsRegister per resource
  Batch fields per resource in one call
  Use GraphQL aliases for multiple resources (max 5 per request)
  Check userErrors on every response

Step 7: CLEANUP
  Delete CSV from temp directory
  Report completion
```

---

## 10. Error Handling

| Error | Cause | Fix |
|---|---|---|
| Digest mismatch | Source changed since fetch | Re-fetch digest and retry |
| Locale not enabled | Target locale not added | Run shopLocaleEnable first |
| Translation value is blank | Empty string passed | Skip empty fields |
| HTTP 429 | Rate limit | Wait 1s, retry. Bucket: 2000pts, restore: 100pts/s |
| CLI_AUTH_REQUIRED | shopify store auth not run | Run auth runbook |
| CLI quote error (Windows) | Inline --query with quotes | Use --query-file instead |
| ANSI in JSON parse | CLI output has color codes | Use --output-file for clean JSON |

---

## 11. Rate Limits

- Maximum bucket: 2000 points
- Restore rate: 100 points/second
- translatableResources(first:50): ~13-23 points
- translationsRegister with 5 translations: ~10 points

Check extensions.cost.throttleStatus.currentlyAvailable. If below 200, add 1s delay.

---

## 12. API Reference Index

| API | Type | Scope | URL |
|---|---|---|---|
| shopLocales | Query | read_locales | https://shopify.dev/docs/api/admin-graphql/2026-04/queries/shopLocales |
| shopLocaleEnable | Mutation | write_locales | https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/shopLocaleEnable |
| shopLocaleUpdate | Mutation | write_locales | https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/shopLocaleUpdate |
| markets | Query | read_markets | https://shopify.dev/docs/api/admin-graphql/2026-04/queries/markets |
| marketWebPresenceUpdate | Mutation | write_markets | https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/marketWebPresenceUpdate |
| translatableResources | Query | read_translations | https://shopify.dev/docs/api/admin-graphql/2026-04/queries/translatableResources |
| translatableResource | Query | read_translations | https://shopify.dev/docs/api/admin-graphql/2026-04/queries/translatableResource |
| translationsRegister | Mutation | write_translations | https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/translationsRegister |
| translationsRemove | Mutation | write_translations | https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/translationsRemove |
| TranslatableResourceType | Enum | — | https://shopify.dev/docs/api/admin-graphql/2026-04/enums/TranslatableResourceType |
| Translation object | Object | — | https://shopify.dev/docs/api/admin-graphql/2026-04/objects/Translation |
| Managing translated content | Guide | — | https://shopify.dev/docs/apps/build/markets/manage-translated-content |
