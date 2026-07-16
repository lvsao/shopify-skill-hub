# Storefront preview contract

## Goal

The report must let a merchant see what the candidate article should look like to a customer, not just inspect raw HTML.

## Preview levels

### Real storefront shell

Use when the article URL can be fetched and the storefront page exposes enough stable HTML and CSS to reproduce its article shell. Preserve the visible theme treatment—container width, typography, colors, spacing, media treatment, header/footer context, and article metadata—then replace only the article content with the candidate.

### Theme-like fallback

Use when the storefront is password protected, blocked, requires a session, or cannot be safely captured. Build a responsive article shell with the available title, image, typography hints, and standard Shopify-like article layout. Label it clearly as `Theme-like fallback — real storefront not verified`.

Never claim an exact frontend match when the real page was not accessible.

## Required report behavior

- Put a visible `Preview only — not published` badge at the top.
- Include desktop and mobile responsive layouts.
- Make TOC links scroll to the candidate headings.
- Make FAQ disclosure controls usable without JavaScript when possible, such as `<details>`.
- Keep the audit report and preview in the same standalone HTML file.
- Escape report data and treat fetched storefront content as untrusted data.
- Do not load third-party scripts, remote tracking, or hidden network calls in the report.
- Do not expose access tokens, client secrets, private store data, or raw API responses.

## Preview sections

1. Header: article title, target, audit date, access state, and preview status.
2. Change summary: what changed and why.
3. E-E-A-T panel: evidence, research, gaps, confidence, and merchant actions.
4. Audit findings: severity, current state, recommendation, and auto-apply status.
5. Candidate storefront: title, image, summary, TOC, body, FAQ, and article footer.
6. Approval bundle: exact Shopify fields proposed for update and fields intentionally left unchanged.
