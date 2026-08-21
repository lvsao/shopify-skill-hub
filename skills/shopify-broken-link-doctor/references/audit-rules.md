# Audit Rules

Load before interpreting an audit.

1. Confirm Shopify with at least two independent signals: Shopify response headers, Shopify CDN/theme markers, `Shopify.shop`, `robots.txt` Shopify evidence, or a valid `products.json` response.
2. Respect the matching `robots.txt` group. If it disallows `/`, write a blocked report without discovering or testing URLs.
3. Sitemap and homepage discovery must remain on the canonical public host. A public 404 probe validates the site's error behavior only; it is never a finding, metric, or repair candidate.
4. Use `HEAD`, fall back to `GET` on `405`/`501`, and use a final `GET` to identify a `200` response whose body indicates a soft 404. Record a maximum of five same-host redirects. Do not follow an external redirect as an internal target.
5. In public mode classify only `public_404_candidate`, `chain`, `loop`, `external_redirect`, or `healthy`. `redirect_to_404`, `homepage_blanket`, and `stale_redirect` require connected Admin `urlRedirects` evidence.
6. Confidence is `high` when final status and body agree, `low` for a soft-404 heuristic, and `medium` when an external redirect or incomplete response needs review.
