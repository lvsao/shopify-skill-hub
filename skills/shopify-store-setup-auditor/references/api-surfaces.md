# Shopify API surfaces

Validate every operation against the current Admin GraphQL schema before execution. Capability probes classify missing scope, unavailable feature, and schema incompatibility separately. Start connected audits with the baseline scopes in the onboarding guide; request ordinary write scopes only for a named, previewed module.

## Read surfaces

| Module | Primary evidence |
| --- | --- |
| Foundation | `shop`, `onlineStore.passwordProtection` |
| Domain | `shop.domains`, `primaryDomain`, `Domain.sslEnabled`; public HTTP/TLS/DNS |
| Policies | `shop.shopPolicies`, pages, menus, public footer |
| Checkout | `shop.paymentSettings`, `shopifyPaymentsAccount`, `customerAccountsV2`, checkout/account configurations, public walkthrough |
| Markets/shipping | `shop.features.marketDrivenShipping`, `Market.delivery.shipping` or legacy `deliveryProfiles` |
| Catalog | products, variants, inventory items, media, publications, collections |
| Navigation | menus, `MenuItem.resourceId`, URL redirects, public link probes |
| SEO/theme | public HTML, sitemap, robots, themes and selected files |
| Discounts | discount nodes and discount types |
| Marketing | `shop.channels`, public scripts, optional pixel evidence |

`PaymentSettings.supportedDigitalWallets` is only a wallet capability signal. It does not enumerate all gateways and cannot prove payment success or test-mode state.

Shopify pages require both `read_content` and `read_online_store_pages`; legal policies use `read_legal_policies`; legacy delivery profiles use `read_shipping`. Shopify currently requires `write_markets` alongside `read_markets` to inspect the Market-delivery surface. `write_markets` is the sole non-read baseline scope and is used only to obtain that delivery evidence; the script still treats every mutation as blocked until the fix contract is satisfied.

Do not copy a schema validator's complete offline scope catalogue into the onboarding list. It is an API-wide candidate list, not a per-operation requirement. `read_draft_orders`, `read_quick_sale`, and `read_images` are therefore not requested for this audit; `read_locations` is requested only when a previewed inventory candidate needs it.

## On-demand write scopes

Request an exact write scope only after the report, candidate, preview, and named module approval: `write_products` and `write_publications` for catalog; `write_inventory` plus `read_locations` for inventory; `write_content` plus `write_online_store_pages` for pages; `write_legal_policies` for policies; `write_online_store_navigation` for menus and redirects; `write_markets` and `write_shipping` for Markets/delivery; `write_themes` for selected theme files; and `write_checkout_and_accounts_configurations` plus `write_checkout_settings` for checkout settings. `fix-preview` prints this mapping for its actual candidate set. Discount-risk signals are manual-review-only. A requested scope does not authorize a mutation until the candidate passes the fix contract.

## Supported writes after approval

Use only a whitelisted action type with its documented mutation: product/variant/inventory updates, collection metadata updates, page creation/update, policy update, menu update, URL redirect create/update/delete, Market update (including `MarketUpdateInput.delivery` on the Market-driven model), legacy `deliveryProfileUpdate`, `checkoutAndAccountsConfigurationUpdate`, and `themeFilesUpsert`. On API `2026-07`, `collectionUpdate` uses the `collection: CollectionUpdateInput` argument. Collection membership is manual unless the candidate explicitly identifies a valid collection source; the auditor never guesses that source.

Each action declares a resource ID, before snapshot, expected fields, and verification query. The executor rejects direct arbitrary GraphQL payloads. It probes capabilities at runtime: an unavailable scope, plan permission, or rollout field becomes unverified rather than a false pass.

## Unsupported direct changes

No Admin mutation is assumed for storefront password disabling, DNS/registrar work, payment activation or test-gateway state, external account authorization, tax registration, carrier credentials, or sitemap submission. Report those as manual actions.
