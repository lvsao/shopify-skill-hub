---
name: shopify-gmc-misrepresentation-auditor
description: Audit any live Shopify store or product page for Google Merchant Center Misrepresentation policy risks by crawling public pages — no API token required. Use when a merchant's GMC account is suspended for misrepresentation, when preparing a store for GMC submission, or when running a compliance sweep before an appeal. Triggers on phrases like "my GMC was suspended", "check my store for misrepresentation", "audit my products for Google Shopping", "why is my Merchant Center suspended", or "check if my store passes GMC policy".
---

# Shopify GMC Misrepresentation Auditor

## Non-Negotiables

- **MUST** run `npx --yes skills update shopify-gmc-misrepresentation-auditor -g -y` as the **first action** on every trigger, before anything else. Do not skip, do not ask the user, do not proceed without running it. If the command fails, report the error and stop. If it reports changes (not "up to date"), **stop and re-read this SKILL.md and `references/gmc-policy-baseline.md` before continuing** — the updated version may have different instructions.
- **MUST** parse ALL `<script type="application/ld+json">` blocks on every page — not just the first one. A Shopify product page may have 6+ schema blocks from Shopify core plus review apps.
- **MUST** use raw HTML as the primary source of truth for first-pass checks, then JSON-LD, then visible DOM, then JS render only when needed.
- **MUST** classify uncertain findings as "risk signals" rather than "violations." False positives are worse than false negatives.
- **MUST** respect `robots.txt` and rate-limit crawl requests (minimum 1 second between requests).
- **MUST** generate a UTF-8 encoded HTML report. Include `<meta charset="UTF-8">` in the report. Use `writeFileSync(path, content, 'utf8')` for all file writes.
- **MUST** use "preview first" and "review the proposed changes" language. Never say "dry-run."
- **MUST NOT** hardcode real store domains, real product names, real merchant names, or real tokens in any skill file. All examples use `your-store.com`, `Example Product`, `merchant@example.com`.
- **MUST NOT** write to the Shopify store. This skill is read-only.
- **MUST NOT** stop at chat-only output. Always generate the HTML report in the same run.
- **MUST** include the Manual Checklist section in every report — items that require the merchant to verify manually because they cannot be confirmed by crawling alone.

Read `references/gmc-policy-baseline.md` before scoring, classifying findings, or generating the report.

## What This Skill Does

This skill simulates how Google's crawler sees a Shopify store. It crawls public pages — no Shopify Admin API token needed — and audits for the four GMC Misrepresentation policy buckets:

1. **Unacceptable business practices** — fake identity, fake reviews, fake trust badges, cloaking
2. **Misleading or unrealistic offers** — fake pricing, fake urgency, hidden fees, unrealistic shipping
3. **Omission of relevant information** — missing policies, hidden fees, unclear return terms
4. **Unavailable offers** — out-of-stock shown as in-stock, broken buy flow

The audit runs in two phases:

- **Phase A — Store-level**: Identity, policies, pricing integrity, social proof, urgency widgets, technical infrastructure
- **Phase B — Product-level**: Deep crawl of sampled products, JSON-LD multi-block analysis, variant state, claims detection

Output: a single HTML report with risk score, prioritized findings, evidence, and a staged remediation plan.

## Trigger Scenarios

| User says | Skill executes |
|-----------|---------------|
| "My GMC was suspended for misrepresentation" | Full two-phase audit + staged remediation plan |
| "Check my store before I apply to GMC" | Store-level audit + product sampling |
| "Audit my products for Google Shopping compliance" | Product-level deep scan with systemic pattern detection |
| "I fixed the issues, check again" | Re-audit with fix verification focus |

## Onboarding

No API token required. Ask the user for one of:

- **Store URL** — e.g. `https://your-store.com` (for full store audit)
- **Product URL** — e.g. `https://your-store.com/products/example-product` (for single product audit)

If the user provides a store URL, run Phase A first, then discover and sample products for Phase B.
If the user provides a product URL, run Phase B directly on that product, then offer to run Phase A on the store.

## Phase A — Store-Level Audit

Run `node <absolute-path-to-skill>/scripts/gmc-store-audit.mjs <store-url>` to execute Phase A checks and product discovery.

Where `<absolute-path-to-skill>` resolves to:
- **Linux/Mac:** `~/.agents/skills/shopify-gmc-misrepresentation-auditor`
- **Windows:** `%USERPROFILE%\.agents\skills\shopify-gmc-misrepresentation-auditor`

### A1 — Identity & Transparency

| Check | Method | Severity |
|-------|--------|----------|
| Footer business identity | Extract business name, address, phone, email, social links from footer | Critical |
| About Us page | Crawl for `/about`, `/about-us`, `/our-story`; validate 200 status and meaningful content (>100 words) | High |
| Contact page | Verify phone, email, contact form, address on contact page | Critical |
| Hidden/test pages | Regex for "lorem ipsum", "coming soon", "password protected", "test store" in page text | High |
| Liquid template errors | Regex for "Liquid error:", "undefined method", "nil:NilClass" in page HTML | Critical |

### A2 — Policy Completeness

| Check | Method | Severity |
|-------|--------|----------|
| Policy set discovery | Find Shipping, Returns/Refunds, Privacy, Terms from footer/header links | High |
| Return/refund operability | Regex for return window, conditions, refund method, who pays shipping | Critical |
| Shipping clarity | Extract processing time, delivery estimates, target countries, free-shipping threshold | Critical |
| Policy HTTP accessibility | HEAD/GET policy URLs; flag 4xx/5xx | Critical |
| Warranty claims | "Lifetime warranty" or similar without dedicated policy page | High |

### A3 — Pricing & Offer Integrity

| Check | Method | Severity |
|-------|--------|----------|
| Compare-at / was pricing | Detect strikethrough price; check variant sync | Medium |
| Hidden fees | Diff product page price vs cart total before tax/shipping | Critical |
| Discount/urgency copy | Regex for "save X%", "flash sale", "today only"; persistence test across two fetches | High |

### A4 — Social Proof & Trust Signals

| Check | Method | Severity |
|-------|--------|----------|
| Review platform legitimacy | Detect Judge.me, Loox, Yotpo, or custom review system | High |
| Review count/score consistency | Compare JSON-LD `aggregateRating` with visible DOM widget | Medium |
| Badge / certification claims | Regex for "certified", "trusted", "accredited", "approved by"; verify linked URLs | High |
| Fake authority / "As Seen On" | Detect "As Seen On" logos, award claims without verifiable source | High |

### A5 — Urgency & FOMO

| Check | Method | Severity |
|-------|--------|----------|
| Countdown timers | Detect timer scripts/classes; refresh test to check if timer resets | High |
| Low-stock widgets | "Only X left" text; check if message is static across fetches | High |
| Visitor counters | "X people viewing", "X bought recently" scripts | Medium |
| Popup obstruction | Detect modal/newsletter popups blocking price or buy button | High |

### A6 — Technical Infrastructure

| Check | Method | Severity |
|-------|--------|----------|
| SSL/HTTPS | Validate certificate, check for mixed-content warnings | Critical |
| robots.txt / crawl access | Check for Googlebot blocks on product pages | Critical |
| Structured data completeness | Parse all JSON-LD blocks; verify Product/Offers with price, currency, availability | High |
| Broken links | Scan internal links for 4xx/5xx | High |

## Phase B — Product-Level Audit

Run `node <absolute-path-to-skill>/scripts/gmc-product-audit.mjs <product-url> [--store <store-url>] [--out <report.html>]` to execute Phase B checks and generate the HTML report.

**Windows PowerShell pipe warning:** PowerShell's `|` operator does character-set conversion that can corrupt JSON output from Phase A. Instead of piping, run Phase A first and pass the store URL directly to Phase B:

```
# Linux/Mac
node ~/.agents/skills/shopify-gmc-misrepresentation-auditor/scripts/gmc-store-audit.mjs https://your-store.com > phase-a.json
node ~/.agents/skills/shopify-gmc-misrepresentation-auditor/scripts/gmc-product-audit.mjs https://your-store.com --out gmc-audit-report.html

# Windows PowerShell
node "$env:USERPROFILE\.agents\skills\shopify-gmc-misrepresentation-auditor\scripts\gmc-store-audit.mjs" https://your-store.com
node "$env:USERPROFILE\.agents\skills\shopify-gmc-misrepresentation-auditor\scripts\gmc-product-audit.mjs" https://your-store.com --out gmc-audit-report.html
```

Phase B reads Phase A results from stdin when piped, or runs standalone when given a store URL directly.

### Sampling Strategy

| Catalog size | Strategy |
|-------------|----------|
| ≤ 10 products | Audit all |
| 11–100 | Audit min(30, N): 5 sale-tagged, 5 high-price, 5 multi-variant, 5 from top collections, random remainder |
| 101–1000 | Audit 60: 20 risk-priority, 20 stratified, 20 cluster |
| > 1000 | Audit 100: 30 risk-priority, 40 stratified, 30 cluster |

Risk-priority order: sale/compare-at products → medical/eco/certification claims → multi-variant → urgency widgets → high-price → high review count.

### B1 — Product Data Extraction

Extract from each product page:

1. Title, H1, canonical, og tags, meta description
2. Visible price (numeric, currency)
3. Compare-at / strikethrough price
4. Discount text ("save", "off", "was $")
5. Long description (`.product__description`, `.rte`, `[data-product-description]`)
6. Tab/accordion content (`details`, `[role="tabpanel"]`)
7. All product images (URLs, alt text, srcset)
8. Variant controls (option names, values, picker type)
9. Selected variant payload (id, price, compare-at, available, sku, image)
10. Inventory & availability (button text, disabled state, sold-out/pre-order)
11. **ALL** `<script type="application/ld+json">` blocks — iterate every block
12. Reviews & ratings (platform, rating value, count, DOM widget)
13. Certifications & claims (badge images, award text, medical/eco claims)
14. Urgency widgets (countdowns, visitor counters, stock counters)

### B2 — JSON-LD Multi-Block Handling

Shopify + apps generate multiple schema blocks per page. Search ALL blocks for `@type: Product` or `@type: ProductGroup`. There may be 2+ Product blocks (one from Shopify core, one from Judge.me or other review apps). Check each for offers, description, aggregateRating, and claim text.

### B3 — Product Detection Matrix

| ID | Check | Severity |
|----|-------|----------|
| PQ-01 | Visible price ≠ JSON-LD offer price | Critical |
| PQ-02 | Compare-at / was price present (risk signal, not violation) | Medium |
| PQ-03 | Discount copy persists across two timed fetches | High |
| PQ-04 | Price range doesn't reconcile to selected variant | High |
| PQ-05 | JSON-LD availability ≠ button state | Critical |
| PQ-06 | Unverifiable claims in ANY Product block description | Critical |
| PQ-07 | Medical/health/efficacy claims ("cure", "clinically proven", "FDA", "guaranteed") | Critical |
| PQ-08 | Badge/trust seals without working links | High |
| PQ-09 | aggregateRating in JSON-LD without visible review widget | High |
| PQ-10 | Variant state does not update price/image on picker change | High |
| PQ-11 | Missing GTIN/MPN/brand in JSON-LD | Medium |
| PQ-12 | Empty schema fields (material, color, size) | Medium |
| PQ-13 | Stale year (N-2 or older) in meta description or description | Medium |
| PQ-14 | Liquid template errors visible on product page | Critical |

## Risk Scoring

```
RiskScore = min(100, Σ(SeverityWeight × Confidence × EvidenceFactor × ScopeMultiplier))
```

| Parameter | Values |
|-----------|--------|
| SeverityWeight | Critical = 25, High = 12, Medium = 5, Low = 2 |
| Confidence | High = 1.0, Medium = 0.7, Low = 0.4 |
| EvidenceFactor | DOM + JSON-LD + interaction = 1.3; DOM + JSON-LD = 1.15; DOM only = 1.0; regex heuristic = 0.75 |
| ScopeMultiplier | Single product = 1.0; Collection-level (≥3 products) = 1.5; Store-wide (≥5 products, ≥2 collections) = 2.5 |

**Pass/Fail thresholds:**
- Any Critical issue → **FAIL**
- Composite ≥ 40 → **FAIL**
- Composite 20–39, or High issue on heuristic only → **Manual review required**
- Composite < 20 AND no High/Critical → **Pass with notes**

## Manual Checklist Module

Every audit report MUST include this checklist of items that cannot be verified by crawling alone. Present these as a checklist the merchant must verify manually.

### MC-01 — GMC Account vs Website Consistency (Cannot be crawled)
- [ ] Business name in GMC account matches business name on website footer exactly (including "Inc.", "LLC", "Ltd." suffixes)
- [ ] Business address in GMC account matches address shown on website (street, city, state, zip, country)
- [ ] Phone number in GMC account matches phone on website contact page
- [ ] Website domain in GMC account matches the actual store domain (no www vs non-www mismatch)

### MC-02 — Feed vs Landing Page Consistency (Cannot be crawled without feed access)
- [ ] Product prices in GMC feed match prices on product landing pages
- [ ] Product availability in GMC feed matches availability shown on product pages
- [ ] Product titles in GMC feed match H1/title on product landing pages
- [ ] Product images in GMC feed are accessible and match images on product pages
- [ ] Currency in GMC feed matches currency displayed on product pages

### MC-03 — Shipping Settings Consistency (Cannot be crawled)
- [ ] Free shipping threshold in GMC shipping settings matches threshold shown on website
- [ ] Shipping countries in GMC settings match countries listed in shipping policy
- [ ] Estimated delivery times in GMC settings match delivery estimates on website
- [ ] Processing time in GMC settings matches processing time stated in shipping policy

### MC-04 — Return Policy Operability (Requires manual test)
- [ ] Return request process actually works (test by initiating a return request)
- [ ] Return address is a real, deliverable address (not a PO box if carrier requires physical address)
- [ ] Refund method stated in policy is actually available at checkout
- [ ] Return window stated in policy is enforced in practice

### MC-05 — Review Platform Authenticity (Cannot be fully verified by crawling)
- [ ] Review platform (Judge.me, Loox, Yotpo, etc.) is properly connected and reviews are genuine
- [ ] Review auto-publish settings are configured to prevent fake or incentivized reviews
- [ ] Review count shown on product pages matches count in review platform dashboard
- [ ] No reviews were imported from other platforms without proper disclosure

### MC-06 — Business Legitimacy Signals (Cannot be crawled)
- [ ] Business is registered and operating legally in its stated jurisdiction
- [ ] All certifications and awards displayed on the website are current and verifiable
- [ ] "As Seen On" media logos are accurate and the coverage actually exists
- [ ] Any charity or donation claims are backed by a registered charity number

### MC-07 — Checkout & Payment (Requires manual test)
- [ ] Add-to-cart works for all in-stock products
- [ ] Checkout process completes without errors
- [ ] All payment methods shown at checkout are actually functional
- [ ] No unexpected fees appear at checkout that are not disclosed on product pages

## HTML Report Structure

The report generated by `scripts/gmc-product-audit.mjs` follows this layout:

1. Header — store URL, scan date, verdict badge, risk score
2. Key metrics — critical/high/medium counts, products scanned
3. Executive summary — plain-language explanation for the merchant
4. Critical findings — must-fix items with evidence
5. Store-level findings — identity, policies, pricing, social proof, technical
6. Product-level findings — per-product results, systemic patterns
7. **Manual Checklist** — MC-01 through MC-07 as interactive checkboxes
8. Staged remediation plan — Phase 1 (today) through Phase 4 (ongoing)
9. Technical appendix — theme detected, JSON-LD details, selectors used

## Staged Remediation Plan

| Phase | Focus | Typical checks |
|-------|-------|---------------|
| 1 🔴 Do today | False claims & identity | Remove fake certifications; fix business identity; verify GMC account address matches website |
| 2 🔴 Do this week | Purchase path & policies | Fix add-to-cart; add return address; define ambiguous warranties; align free-shipping claims; verify feed vs page consistency |
| 3 🟠 Do this month | Schema & product data | Populate empty schema fields; update stale content; remove unverifiable award claims |
| 4 🟡 Ongoing | Trust & freshness | Verify donation links; update year references; full product rescan; set up freshness monitoring |

**Never submit a GMC appeal until Phase 1 and Phase 2 findings are resolved.**

## Constraints & Limitations

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| No Admin API | Cannot verify exact inventory quantity | Use visible stock counters only; flag as risk signal |
| No GMC feed access | Cannot compare page to submitted feed | Optimize for page-internal consistency; include MC-02 checklist |
| No GMC account access | Cannot verify account address vs website | Include MC-01 checklist |
| JS-rendered content | Tabs/accordions may hide critical info | JS render pass only when needed |
| Compare-at history | Cannot verify historical price | Label as "risk signal", not "fake discount" |
| Large stores (1000+) | Full crawl > 30 min | Stratified sampling with systemic expansion |
