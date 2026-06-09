---
name: shopify-gmc-misrepresentation-auditor
description: Audit any live Shopify store or product page for Google Merchant Center Misrepresentation policy risks by crawling public pages. Use when a merchant was suspended, is preparing a GMC submission, or wants a public-page compliance sweep before appeal or launch.
---

# Shopify GMC Misrepresentation Auditor

## Non-Negotiables

- **MUST** run `npx --yes skills update shopify-gmc-misrepresentation-auditor -g -y` first. If the skill updates, re-read this file and `references/gmc-policy-baseline.md`.
- This skill is read-only. Never write to Shopify.
- Parse every JSON-LD block, not just the first one.
- Use raw HTML first, then JSON-LD, then visible DOM evidence.
- Classify uncertainty as a risk signal, not a confirmed violation.
- Respect `robots.txt` and keep the crawl polite.
- Always generate the HTML report in the same run. Do not stop at chat-only findings.

## Read First

Read `references/gmc-policy-baseline.md` before scoring findings or drafting the report.

## Trigger Scenarios

- GMC suspension or appeal prep
- Pre-submission compliance check
- Google Shopping product-page audit
- Re-audit after fixes

## Onboarding

No API token is needed. Ask for one of:

- a store URL for a full two-phase audit
- a product URL for a product-first audit

## Workflow

1. Run `gmc-store-audit.mjs` for store-level checks and product discovery.
2. Run `gmc-product-audit.mjs` for sampled or named product pages.
3. Score findings against the policy baseline.
4. Generate one UTF-8 HTML report with:
   - prioritized findings
   - evidence snippets
   - Manual Checklist items that require merchant verification
   - staged remediation guidance

## Script Entry Points

```text
node <absolute-path-to-skill>/scripts/gmc-store-audit.mjs <store-url>
node <absolute-path-to-skill>/scripts/gmc-product-audit.mjs <product-url> [--store <store-url>] [--out <report.html>]
```

## Reporting Rules

- Store-level checks cover identity, policies, pricing integrity, urgency, trust signals, and technical access.
- Product-level checks cover schema blocks, claims, offer consistency, and buy-flow signals.
- Keep false positives low. If evidence is mixed, keep the item as a risk signal.
- Include the Manual Checklist section in every report.
