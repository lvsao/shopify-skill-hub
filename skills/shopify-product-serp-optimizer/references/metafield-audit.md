# Metafield Audit

Use this reference whenever `shopify-product-serp-optimizer` audits or proposes changes to product metafields.

## Two-Layer Audit Rule

Always audit metafields in two separate layers:

1. Definition layer:
   - query `metafieldDefinitions(ownerType: PRODUCT)`
   - identify schema, type, namespace, key, access, and `metafieldsCount`
2. Value layer:
   - query the product's actual `metafields`
   - identify which values are populated on the current product

Do not confuse these layers.

- A definition can exist even when the current product has no value.
- A product can have value-only metafields from apps or legacy data even when no surfaced definition appears in the current definition audit.

## Missing Value Logic

Do not expect `product.metafields` to return explicit empty values.

Correct interpretation:

- if a definition exists and the product has no matching metafield instance, treat that as `defined but missing on this product`
- do not describe it as an empty string unless the API actually returned one

## Source Attribution

Infer source conservatively.

- `judgeme.*` likely review-app data
- `shopify.*` likely Shopify standard or platform-managed data
- `custom.*` often merchant-created custom fields
- Google-shopping namespaces may indicate feed or merchant-center integration

Mark uncertain attribution as inferred, not confirmed.

## Optimization Rule

Only propose metafield value updates when all of these are true:

- the definition meaning is clear from `name`, `description`, `namespace`, `key`, or known platform/app conventions
- the product evidence supports a specific value
- the value can be written without inventing missing facts

If any of those fail:

- report the field
- explain why it matters
- suggest a fill direction
- do not guess the final value

## High-Value Modules

Common modules worth surfacing in the audit report:

- Review
- Material
- Specification
- Dimension
- Product Detail
- Features
- Google Shopping / feed signals

The report should show:

- detected modules
- populated metafields worth preserving or tightening
- defined but missing metafields worth filling
- value-only metafields detected from apps or legacy data

## Write Path

Use `metafieldsSet` for approved metafield writes.

Each approved update should include:

- `ownerId`
- `namespace`
- `key`
- `type`
- `value`

For bundle writes, keep metafield updates inside the same approval packet as title, description, SEO, and alt text changes when relevant.
