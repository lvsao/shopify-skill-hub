# Selofy Skill Hub — Shopify Onboarding Guide

Use the shared Selofy Skill Hub onboarding pattern.

## Before Asking Setup Questions

1. Identify the current working directory.
2. Check for the exact filename `skill-hub.env` in that directory.
3. If the file already has complete non-placeholder values, run the connection check before asking anything else.

## Ask Only One Setup Question

```text
Where did you create your Shopify app?

A - Shopify store Settings custom app (Legacy Custom App)
B - Dev Dashboard app
```

## Required Helper Commands

```text
node <absolute-path-to-skill>/scripts/shopify-markets-localization-auditor.mjs init-env --method admin_custom_app --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-markets-localization-auditor.mjs init-env --method dev_dashboard_app --env skill-hub.env
node <absolute-path-to-skill>/scripts/shopify-markets-localization-auditor.mjs connection-check --env skill-hub.env
```

## Path A

Ask the user to fill only:

- store address
- Admin API access token

Recommended scopes:

```text
read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_shipping,read_legal_policies,read_products
```

## Path B

Ask the user to fill only:

- store address
- app Client ID
- App Automation Token

Recommended scopes:

```text
read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_shipping,read_legal_policies,read_products
```

Before `shopify store auth`, tell the user that a Shopify approval page may open and they should click **Authorize**.

## Output Rule

Create `skill-hub.env` in the user's current working directory.

Do not keep temp auth files, query files, output files, or scratch JSON after the workflow finishes.
