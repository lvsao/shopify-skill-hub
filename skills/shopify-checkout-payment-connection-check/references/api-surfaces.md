# API surfaces and interpretation

Use only the approved read-only surfaces below. Do not expand scopes silently.

## Store connection

Use the Admin GraphQL API after a merchant authorizes one of the two onboarding paths. The script supports the selected path only:

- `shopify_cli_oauth` for a quick browser authorization;
- `dev_dashboard_client_credentials` for an installed Dev Dashboard app and in-memory short-lived token.

Do not infer the mode from the presence of credentials.

## Payment setup

`shopifyPaymentsAccount { activated }` requires `read_shopify_payments` or `read_shopify_payments_accounts`. `activated: true` means Shopify Payments setup is completed. It does not enumerate every externally configured provider and does not prove that a buyer can complete a charge.

## Payment signals

Use `orders` and nested `transactions` with `read_orders`. In the current Admin GraphQL schema, `Order.transactions` is a flat array; keep compatibility with a legacy `{ nodes }` fixture only for deterministic tests. Aggregate only transaction kind, status, gateway label, and error code. Do not output order IDs, customers, addresses, products, amounts, or payment details.

A Shopify write scope for the same resource also grants read access. The helper therefore accepts `write_orders` for `read_orders` and `write_shipping` for `read_shipping`; it does not silently request or add scopes.

An `ERROR` or `FAILURE` transaction is a signal to investigate, not proof that one gateway caused all checkout abandonment. The ordinary order-history window may be limited; disclose the sampled window returned by the API.

## Delivery configuration

Use `deliveryProfiles` with `read_shipping` to read configured zones and active method definitions. This is configuration evidence. The public checkout test remains the customer-experience evidence because a rate can depend on the actual cart, destination, and checkout conditions.

## Public checkout walkthrough

Use a browser session for the shopper-facing portion. Re-snapshot after every navigation. Add one merchant-selected purchasable item, visit checkout, and use synthetic data only where a form permits it.

Never complete a payment, enter a payment credential, or treat a visible payment method as proof of successful charging. A provider handoff may be recorded as reachable only when the next page opens without authentication or payment data.

## Official documentation

- [ShopifyPaymentsAccount](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/ShopifyPaymentsAccount)
- [OrderTransaction](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/OrderTransaction)
- [deliveryProfiles](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/deliveryProfiles)
