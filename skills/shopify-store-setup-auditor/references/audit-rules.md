# Audit rules and scoring

## Evidence states

Every check is one of `pass`, `warning`, `critical`, `info`, or `unavailable`.

- `unavailable` means the required Admin scope, public response, plan feature, or reliable API surface is absent. It never counts as a pass.
- A public observation is not substituted for private Admin evidence, and an Admin setting is not substituted for a buyer-facing checkout observation.
- Findings must include a human-readable evidence summary, source (`admin`, `public`, `manual`), confidence, and either a supported action or a manual guide.

## Weighted readiness score

| Group | Weight |
| --- | ---: |
| Launch and payment evidence | 25 |
| Markets and delivery | 20 |
| Catalog readiness | 20 |
| Policies, navigation, and trust | 15 |
| SEO and theme experience | 10 |
| Discounts and tracking | 10 |

For evaluated checks, a pass receives its full weight, warning receives half, and critical receives zero. `score` is the weighted result over evaluated checks. `evidenceCoverage` is evaluated group weight divided by all configured group weight; it is not a substitute for a required module. A missing module, a module that reports partial evidence, a deliberately scoped-down audit, or a capped catalog keeps the final status at **Partial evidence** even when the percentage is high.

Status labels:

- **Blocked**: one or more Critical findings.
- **Partial evidence**: evidence coverage below 75%, or any required module is missing, partially evidenced, or capped; never describe the store as ready.
- **Ready with warnings**: no Critical, coverage at least 75%, score 75–89.
- **Ready**: no Critical, coverage at least 90%, score at least 90.

## High-confidence critical checks

- Storefront password is enabled while the merchant requests a public launch audit.
- The public primary domain cannot establish HTTPS or resolves to an unusable response.
- A tested sellable product cannot reach checkout, subject to public storefront access.
- An active target Market has no shipping configuration in its applicable shipping model.
- A customer-facing menu item resolves to a confirmed 404 or redirect loop.
- An active product has no purchasable variant or has an invalid negative/effectively free discount configuration confirmed by Admin evidence.

## Non-blocking or manual-only checks

Test-mode state, payment-provider contracts, taxes, DNS ownership, carrier credentials, account connections, policy legal adequacy, GSC/Bing submission, and server-side conversion events are manual evidence unless an authorized service proves them.

## False-positive guards

- Empty collections warn only when published or linked from navigation.
- Products outside a collection are not automatically orphaned if directly linked, unpublished, or intentionally channel-specific.
- A zero weight warns only when the inventory item requires shipping and a weight-dependent rate is detected; no default weight is proposed.
- Missing barcode is a feed-readiness warning, never an invitation to fabricate a GTIN.
- Visible pixels prove only client-side detection; server pixels, Ads account linkage, and event delivery remain unverified.
