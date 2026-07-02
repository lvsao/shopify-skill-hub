# API Surfaces

Use this reference before interpreting data or proposing fixes.

## Admin GraphQL Surfaces Used In V1

Official references verified against Shopify Admin API `2026-04`:

- `shopLocales`
- `availableLocales`
- `shopLocaleEnable`
- `shopLocaleUpdate`
- `markets`
- `marketUpdate`
- `marketWebPresenceUpdate`
- `translatableResources`
- `translationsRegister`
- `deliveryProfiles`
- `shop`

## Locale Readiness

Use:

- `shopLocales` for enabled and published locale state
- `translatableResources` with `translations(locale: "...")` for full coverage counts

V1 coverage resource types:

- `PRODUCT`
- `COLLECTION`
- `PAGE`
- `BLOG`
- `ARTICLE`
- `SHOP`
- `SHOP_POLICY`

Why this list:

- It covers the core store copy most merchants care about.
- It is reviewable.
- It avoids inflating the score with technical resource types that merchants never read directly.

Coverage math:

- `eligible`: text fields counted after skipping `handle` and non-text payloads
- `current`: translation exists and `outdated` is `false`
- `outdated`: translation exists and `outdated` is `true`
- `missing`: no translation found

Readiness score:

```text
current / eligible
```

Gap score:

```text
(missing + outdated) / eligible
```

## Markets

Use `markets` to read:

- basic market state
- regions
- currency settings
- web presence
- default and alternate locales

Use `marketUpdate` for:

- enabling local currencies through `currencySettings`

Use `marketWebPresenceUpdate` for:

- changing the market main language
- adding a market language

V1 does not auto-create a market web presence because the subfolder or domain choice needs human review.

## Shipping Coverage

Use `deliveryProfiles` and each profile's location groups and zone country coverage.

Interpretation rule:

- If a market country does not appear in any shipping zone, call it a shipping gap.
- If shipping zones exist but the mapping is ambiguous, mark it as `check by hand`.

This is a shipping profile audit. It does not fully represent every fulfillment app or backend flow.

## Storefront Checks

Use storefront crawling for:

- `hreflang` alternate links
- canonical link
- policy-page visibility

Use admin data for:

- policy content existence
- market and locale state

## Automatic Redirection

Shopify Help Center documents automatic redirection in `Online Store > Preferences`, but V1 does not rely on a documented Admin GraphQL field for this setting.

Rule:

- do not audit or score this setting
- do not claim a precise API-backed on/off value unless Shopify documents a stable field for it
- mention it only as a manual reminder in the final report

## Selector Detection

Do not audit or score selector visibility in this skill.

Reason:

- selector visibility is theme-dependent
- selectors may be rendered dynamically
- static HTML alone is not reliable enough for a strong pass/fail result

Mention selector checks only as a low-priority manual reminder in the report.

## Safe Mutations In V1

Allowed after approval:

- `shopLocaleEnable`
- `shopLocaleUpdate`
- `marketUpdate`

Not auto-applied in V1:

- `marketCreate`
- `marketRegionsCreate`
- `marketWebPresenceCreate`
- `marketWebPresenceUpdate`
- `translationsRegister`

Those can still be suggested in the report as next steps.
