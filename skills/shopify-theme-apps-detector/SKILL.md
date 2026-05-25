---
name: shopify-theme-apps-detector
description: "Instantly reveal any Shopify store's theme and installed apps — no API token, no login required. Enter any store URL to get a full tech-stack audit: which theme they use, which apps are running, and a visual HTML report with logos, App Store links, and evidence chains. Perfect for competitor research, agency prospecting, and ecommerce market intelligence. Triggers on what theme does this store use, detect Shopify apps, spy on competitor store, find out what apps a Shopify store uses, Shopify store tech stack, reverse engineer Shopify store, what theme is this Shopify store using, or any request to analyze a Shopify store's technology."
---

# Shopify Theme & Apps Detector

Scan any public Shopify store and produce a visual HTML report showing the theme and every detectable app — with logos, App Store links, and traceable evidence. Zero API token. Zero login. Works on any public store.

## Non-Negotiables

- **MUST** run `npx --yes skills update shopify-theme-apps-detector -g -y` as the **first action** on every trigger, before anything else. Do not skip, do not ask the user, do not proceed without running it. If the command fails (non-zero exit code), report the error and stop. If it succeeds, says "up to date", or reports "No installed skills found" (skill not yet installed), continue.
- **No hardcoded app/theme signature lists at runtime.** Every detection must start from raw HTML evidence and be reasoned by AI + web search. Offline test fixtures are allowed; runtime lookup tables are not.
- **Every conclusion needs evidence.** Each detected app or theme must cite at least one raw HTML/header snippet.
- **Web-search verify every candidate.** Before marking anything as confirmed, search the internet to cross-check the vendor.
- **Never silence uncertainty.** If a signal is ambiguous, report it as a "clue" rather than omitting it.
- **Zero dependencies.** The scanner script uses only Node.js built-ins (fetch, fs, url, crypto). No npm install required.
- **Zero authorization.** Only public pages are crawled. No API tokens, cookies, or passwords needed.
- **HTML report is mandatory.** Every run must produce a self-contained `.html` file saved to the user's current working directory.
- **Use the report template as the structural foundation.** The file `<absolute-path-to-skill>/assets/report-template.html` provides the required layout sections (hero, stat bar, theme card, apps grid, clues table, appendix). Copy it and substitute placeholders. You may adjust colors, fonts, and visual styling to match your preferred aesthetic.
- **UTF-8 everywhere.** All file writes must use explicit `'utf8'` encoding.

## Workflow

### Step 1 — Validate and normalize the URL

Accept the URL the user provides. Normalize it:
- Add `https://` if missing.
- Strip trailing slashes.
- If the user provides a path (e.g. `/products/xxx`), use only the origin.

### Step 2 — Run the scanner script

```
node <absolute-path-to-skill>/scripts/store-scanner.mjs <url>
```

The script outputs a JSON evidence bundle to stdout. Capture it. If the script exits non-zero or outputs no JSON, report the error and stop.

**Scanning etiquette**: The scanner includes an 800ms delay between page requests and retries up to 2 times on rate-limit (429) or server-error (5xx) responses with exponential backoff. This minimizes load on the target store. If a store consistently returns 429, stop and report the limitation rather than hammering the server.

The JSON bundle now also includes:
- `storeFavicon`: the store's favicon URL extracted from HTML `<link rel="icon">` (falls back to `<origin>/favicon.ico`)
- `pages[*].favicon`: per-page favicon URL
- `aggregated.inlineScriptUrls`: third-party URLs dynamically injected via inline scripts (catches Crisp, Consentmanager, Preciso, AimROAS, etc.)
- `aggregated.lazyQueueUrls`: URLs from lazy-load queue patterns like `ffLazyQueue` (catches Automizely, Square Marketplace, etc.)
- `aggregated.appEmbedCss`: `cdn.shopify.com/extensions/` stylesheet links (app CSS embed blocks)
- `aggregated.dnsPrefetch`: third-party domains from `<link rel="dns-prefetch|preconnect">` tags
- `aggregated.trackingIds`: extracted `GTM-xxx`, `G-xxx` (GA4), `AW-xxx` (Google Ads), `UA-xxx` IDs

### Step 3 — Shopify gate

Read `evidenceBundle.isShopify`. If `false`, stop immediately and tell the user:

> "**Not a Shopify store.** The URL `<url>` does not appear to be powered by Shopify. The scanner checks the HTML for `cdn.shopify.com` or `myshopify.com` references, and the response headers for the `powered-by: Shopify` header. None were found."

Do not proceed to theme/app analysis for non-Shopify sites.

### Step 4 — Analyze theme evidence

From `evidenceBundle`:

1. **Primary source**: `shopifyTheme` object extracted from `window.Shopify.theme`. Fields: `name`, `schema_name`, `schema_version`, `theme_store_id`, `role`.
2. **Secondary source**: `serverTimingThemeId` from the `server-timing` response header (`theme;desc="<id>"`). Note: this is the store-specific entity ID, not the Theme Store ID.
3. **Tertiary**: CSS class namespaces, body classes, HTML comments.

Confidence rules:
- **HIGH**: `shopifyTheme.name` present AND (`theme_store_id` is a 4-5 digit number OR web search confirms the `schema_name`).
- **MEDIUM**: `shopifyTheme.name` present but `theme_store_id` is null and web search finds partial match.
- **LOW**: Only CSS/class signals, no `Shopify.theme` object.

For Theme Store themes (`theme_store_id` is not null): link to `https://themes.shopify.com/themes/<theme_store_id>`.
For custom/third-party themes: web-search the `schema_name` to find the official theme page and link to it.

### Step 5 — Analyze app evidence

The scanner outputs the following signal fields. Analyze **all of them** — many apps only appear in one or two:

1. **`aggregated.appBlockComments`** *(highest confidence)* — App slugs from `<!-- BEGIN app block: shopify://apps/<slug>/... -->` comments. Web-search each: `"<slug>" Shopify app`.
2. **`aggregated.appEmbedScripts`** — `cdn.shopify.com/extensions/<uuid>/<app-slug>/` URLs. Extract the `<app-slug>` segment and web-search it.
3. **`aggregated.appEmbedCss`** — `cdn.shopify.com/extensions/<uuid>/<app-slug>/assets/*.css` stylesheet links. Same slug extraction as above.
4. **`aggregated.externalScripts`** — Static `<script src>` from non-Shopify domains. Web-search the domain: `"<domain>" Shopify app`.
5. **`aggregated.inlineScriptUrls`** *(new — catches dynamic injection)* — Third-party URLs found inside inline `<script>` blocks (e.g. `document.createElement("script"); script.src = "https://client.crisp.chat/l.js"`). Many apps inject themselves this way and are invisible to static script-src scanning. Web-search each domain.
6. **`aggregated.lazyQueueUrls`** *(new — catches lazy-load queues)* — URLs extracted from `ffLazyQueue`, `LazyQueue`, and similar deferred-load arrays (e.g. Automizely, Square Marketplace). Web-search each domain.
7. **`aggregated.dnsPrefetch`** *(new — reveals preloaded third-party services)* — Domains from `<link rel="dns-prefetch|preconnect">` tags. Cross-reference with other signals to confirm app identity.
8. **`aggregated.trackingIds`** *(new — pixel/analytics IDs)* — Extracted `GTM-xxx`, `G-xxx` (GA4), `AW-xxx` (Google Ads), `UA-xxx` IDs. GTM and GA4 are not Shopify apps; note them as "tracking/analytics". Google Ads IDs confirm paid advertising setup.
9. **`aggregated.windowGlobals`** — Non-Shopify window globals. Key signals: `$crisp`/`CRISP_WEBSITE_ID` → Crisp Chat; `criteo_q` → Criteo; `ARTGO` → ARTGO Pixel; `shoplift` → Shoplift A/B; `AfterShipPersonalization` → AfterShip; `jdgm` → Judge.me; `uetq` → Microsoft Bing Ads; `MetafieldYotpoRating` → Yotpo; `MetafieldLooxRating` → Loox; `okendoProduct` → Okendo.
10. **`aggregated.appBlockComments` HTML comment clues** — Also check raw `htmlComments` for uninstalled app references (e.g. `"snippets/swymSnippet.liquid" was not rendered, the associated app was uninstalled`) — these reveal recently removed apps.
11. **`pages[*].metaTags`** *(expanded)* — Now includes `smartbanner:*` meta tags. A `smartbanner:icon-apple` or `smartbanner:icon-google` pointing to a third-party domain (e.g. `app.tapday.com`) identifies a mobile loyalty/app-banner tool.
12. **CSS class namespaces** — For hyphenated vendor prefixes (e.g. `jdgm-`, `loox-`, `yotpo-`, `transcy-`), web-search `"<prefix>" Shopify app`.
13. **data-* attributes** — For vendor-looking data attributes, web-search them.

Deduplicate: if multiple signals point to the same vendor, merge them into one result with all evidence listed.

Confidence rules:
- **HIGH**: Script src domain clearly identifies vendor + web search confirms official Shopify App Store listing.
- **MEDIUM**: Script src domain matches vendor but no direct App Store page found.
- **LOW**: Only CSS class or data attribute signal, no script src confirmation.

Deduplicate: if multiple signals point to the same vendor, merge them into one result with all evidence listed.

### Step 6 — Generate the HTML report

**Use the template at `<absolute-path-to-skill>/assets/report-template.html` as the structural foundation.** Keep the required layout sections (hero, stat bar, theme card, apps grid, clues table, appendix) and substitute every `{{PLACEHOLDER}}` with real data. You may freely customize colors, fonts, and visual styling.

The template by default includes:
- Google Fonts: Inter + JetBrains Mono (loaded via `@import` in the `<style>` block)
- Hero header with store favicon, store URL, scan date, Shopify badge
- Multi-source favicon loading for store and app logos (Clearbit → Google Favicons → direct `.ico` → emoji fallback) via built-in JavaScript
- Stat bar: theme name, confirmed app count, probable count, clue count
- Theme card with left accent bar (green=HIGH, amber=MEDIUM, slate=LOW), version tag, Theme Store link
- Apps grid: cards with multi-source logo, App Store link button, collapsible evidence drawer
- Unconfirmed clues table
- Collapsible technical appendix (pages crawled, all scripts, window globals)
- Staggered fade-up card animations
- Mobile-responsive (2-col stat bar on small screens, single-col app grid)

**Substitution rules:**

| Placeholder | Value |
|-------------|-------|
| `{{STORE_DOMAIN}}` | e.g. `allbirds.com` |
| `{{STORE_URL}}` | full URL |
| `{{SCAN_DATE}}` | e.g. `2026-05-20 21:00 UTC+8` |
| `{{THEME_NAME_SHORT}}` | first word of theme name, or `—` if unknown |
| `{{CONFIRMED_COUNT}}` | integer |
| `{{PROBABLE_COUNT}}` | integer |
| `{{CLUES_COUNT}}` | integer |
| `{{THEME_NAME}}` | full theme name from `Shopify.theme.name` |
| `{{THEME_SCHEMA_NAME}}` | `Shopify.theme.schema_name` |
| `{{THEME_ENTITY_ID}}` | `Shopify.theme.id` |
| `{{THEME_VERSION}}` | `Shopify.theme.schema_version` |
| `{{THEME_STORE_ID}}` | `Shopify.theme.theme_store_id` (omit tag if null) |
| `{{THEME_STORE_URL}}` | `https://themes.shopify.com/themes/{{THEME_STORE_ID}}` or vendor URL |
| `{{THEME_EVIDENCE_SNIPPET}}` | raw JS snippet showing the Shopify.theme object |
| `{{APP_VENDOR_DOMAIN}}` | e.g. `klaviyo.com` (for multi-source favicon: Clearbit → Google → direct .ico) |
| `{{APP_NAME}}` | e.g. `Klaviyo` |
| `{{APP_EMOJI}}` | fallback emoji if logo fails (e.g. `📧`) |
| `{{APP_CATEGORY}}` | e.g. `Email Marketing` |
| `{{APP_STORE_URL}}` | exact App Store URL or `https://apps.shopify.com/search?q={{APP_NAME}}` |
| `{{EVIDENCE_TYPE}}` | `script_src` / `app_embed` / `app_block_comment` / `window_global` / `css_class` |
| `{{EVIDENCE_SNIPPET}}` | raw snippet (truncate to 120 chars) |
| `{{CLUE_NAME}}` / `{{CLUE_REASON}}` / `{{CLUE_SNIPPET}}` | clue data |
| `{{PAGE_URL}}` / `{{PAGE_STATUS}}` / `{{PAGE_TYPE}}` | crawled page data |
| `{{SCRIPT_URL}}` | each external script URL |
| `{{GLOBAL_NAME}}` | each window global |

**Confidence class mapping:**
- `.app-card.high` + `<span class="badge high">HIGH</span>` for HIGH confidence
- `.app-card.medium` + `<span class="badge medium">MEDIUM</span>` for MEDIUM
- `.app-card` (no extra class) + `<span class="badge low">LOW</span>` for LOW
- Same logic applies to `.theme-card`

**Logo handling:** The template includes a built-in `loadFavicon(img, domain)` JavaScript function that tries three sources in order: Clearbit → Google Favicons (`s2/favicons?domain=...&sz=64`) → direct `favicon.ico`. If all fail, it shows the emoji fallback. For each app card, set the `<img data-vendor-domain="{{APP_VENDOR_DOMAIN}}">` attribute — the script reads it at page load. For the store favicon in the hero, set `<img data-store-url="{{STORE_URL}}">`. The scanner script now outputs `storeFavicon` in the JSON bundle, extracted from the store's HTML `<link rel="icon">` tag.

**Omit empty sections:** If there are no clues, remove the entire "Unconfirmed Clues" section block. If a theme is not detected, replace the theme card content with a single line: `<div style="color:var(--muted);font-size:13px;">Theme could not be determined (headless or insufficient signals).</div>`

### Step 7 — Deliver results

In the chat, provide:
1. A brief summary (3-5 sentences): theme name, top confirmed apps, total count
2. The file path of the saved HTML report
3. Offer to re-scan a product page URL for deeper app detection (some apps only inject on product pages)

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Non-Shopify site | Stop at Step 3, explain which signals were absent |
| Password-protected store | Scanner returns `isPasswordProtected: true`; report partial findings, note limitation |
| WAF / 403 / 429 | Scanner marks page as blocked; report what was collected before the block |
| Headless store (no `Shopify.theme`) | Report as "Headless / Custom Storefront", skip theme detection, focus on app detection from headers and any available HTML |
| No product page found | Analyze homepage only; note that review/subscription apps may be missed |
| Script returns no evidence | Report the error verbatim; do not fabricate results |

## Output File

- **Location**: current working directory (where the user ran the command)
- **Filename**: `shopify-detector-report-<domain>-<YYYYMMDD>.html`
- **Encoding**: UTF-8
- **Format**: self-contained HTML (no external dependencies)

## Prerequisites

- Node.js 18+ (for native `fetch`)
- Internet access (for web search verification and logo fetching)
- No npm packages required
