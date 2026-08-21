# Redirect Fix Rules

Load before editing a candidate CSV.

- Shopify `UrlRedirect` writes use `urlRedirectCreate`, `urlRedirectUpdate`, or `urlRedirectDelete` with `write_online_store_navigation`; read and validate existing redirects first.
- Preserve intent and market prefix: choose the closest live replacement product or collection. Never redirect every failed URL to the homepage or a generic collection.
- If no relevant live target exists, retain an honest `404`/`410`; set `action=keep_404`, leave `target` empty, and do not write.
- Flatten a chain to its final live `200` target. Break loops before other work. Do not delete a redirect merely because it looks old without connected evidence and merchant approval.
- For `create` or `update`, CSV `path` and `target` must be distinct absolute paths. Set `approved=true` only after the merchant has reviewed that exact row. `delete` also requires `approved=true`.
- After every approved write, inspect GraphQL `userErrors`, then verify source → redirect → final `200` publicly. Report failures; never retry a mutation blindly.
