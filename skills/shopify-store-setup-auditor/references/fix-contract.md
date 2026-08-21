# Fix contract

## Candidate shape

Candidates are temporary JSON objects supplied only after merchant review. They use no credentials and are never committed:

```json
{
  "auditDigest": "sha256 from the audited report manifest",
  "changes": [
    {
      "id": "catalog-product-title-<stable-id>",
      "module": "catalog",
      "findingId": "product-title-<stable-id>",
      "type": "product_update",
      "resource": { "id": "gid://shopify/Product/...", "kind": "Product" },
      "before": { "id": "gid://shopify/Product/...", "updatedAt": "2026-08-21T00:00:00Z" },
      "input": { "product": { "id": "gid://shopify/Product/...", "title": "Approved title" } },
      "expected": { "title": "Approved title" },
      "merchantProvided": true,
      "moduleApproval": true
    }
  ]
}
```

Do not include secrets, customer data, payment data, raw HTML from crawls, unbounded script tags, or unreviewed legal claims.

## Preview and execute

`fix-preview` validates the action type, scope, resource ID, candidate payload, and current snapshot. It emits a preview report only.

`fix --execute` accepts only a selected-module change that is bound to the audited report by `auditDigest` and a matching emitted `findingId`. Every mutation, not only high-impact mutations, needs a current before snapshot where applicable, merchant-provided sensitive values, and `moduleApproval: true`. It re-reads the resource immediately before execution, rejects stale state, stops that change on `userErrors`, does not retry writes blindly, then re-reads the resource again and compares it with `expected` for verification.

`expected` must include at least one actual post-write value from the candidate input; an ID alone is not verification. Variant candidates must identify each changed variant and its expected changed field. Product-publication candidates use `expected.publications: [{ "id": "<publication-id>", "published": true }]`. Menu candidates include complete `before.items` and `expected.items` snapshots. Redirect deletion uses `expected: { "deleted": true }`.

Theme candidates must include a checksum snapshot for every selected filename. `themeFilesUpsert` is allowed only after those exact source files were read and matched; the executor polls the returned job before verification. It never publishes a theme.

High-impact actions — price, inventory quantity, inventory policy, product publication, Markets, shipping, checkout/account configuration, and theme files — require a concrete before/after value. Discount-risk signals remain manual review because a public or textual risk signal is not enough to justify deactivation. The agent must not turn a warning into a guessed value.
