# Research protocol

## Candidate ledger

Keep one JSON object with a `target_root_domain` and a `candidates` array. `target_root_domain` is the normalized public root domain of the website being promoted. Each candidate needs:

```text
id, target_url, root_domain, opportunity_type, lane, route, evidence_state, evidence_url,
why_relevant, next_action, cost_or_disclosure, quality_risk
```

Field semantics are fixed: `target_url` is the owned page that should receive the link; `evidence_url` is a public page on the external source site that supports the prospect or route; and `root_domain` is the normalized root domain of that external source. The evidence URL must not be on the target site.

Allowed `opportunity_type` values:

- `new_prospect` — a new external acquisition opportunity that is not presented as an existing link;
- `existing_link_reclamation` — an existing link, unlinked mention, correction, or broken-link recovery path for the target site.

Allowed `evidence_state` values:

- `verified_existing_link`
- `verified_submission_route`
- `verified_relevant_editorial_target`
- `research_lead`

Allowed `route` values:

- `editorial_pitch`
- `resource_inclusion`
- `link_reclamation`
- `submission`
- `partnership`
- `showcase_or_award`
- `affiliate_or_creator`
- `other_disclosed`

## Coverage matrix

For the **full** tier, research every lane with at least eight distinct query or source checks before treating the run as complete:

1. `own_mentions_and_reclamation` — existing mentions and link reclamation;
2. `target_site_citable_resources` — target-site resources that deserve citations;
3. `supplied_competitor_links` — supplied competitor referring pages;
4. `comparable_brand_paths` — comparable-brand discovery and link paths;
5. `independent_editorial` — independent editorial coverage and buyer resources;
6. `expert_and_reference_resources` — specialist writers, expert organizations, and reference resources;
7. `trade_and_business_media` — trade, professional, and business media;
8. `partnerships_and_collaborators` — partnerships, suppliers, retailers, and collaborators;
9. `events_showcases_and_awards` — events, new-product showcases, and awards;
10. `reputable_listings` — reputable free business or industry listings;
11. `creator_and_affiliate_coverage` — creator and affiliate coverage with clear disclosure;
12. `replacement_opportunities` — broken, outdated, or incomplete resource replacement.

Use the target site's run-local language, geography, topic phrases, brand terms, and publicly visible assets to create query families. Do not start from a fixed business category or from a saved merchant example.

For the **minimum** tier, cover at least eight of the listed lanes with at least four distinct query or source checks for each represented lane. State the omitted lanes and why they could not be completed without lowering source quality.

## Quality gates

Choose one declared tier before validating:

| Tier | Candidates | Root domains | Coverage lanes |
| --- | ---: | ---: | ---: |
| `full` | at least 100 | at least 60 | at least 10 | at least 80 new prospects |
| `minimum` | at least 40 | at least 25 | at least 8 | at least 32 new prospects |

Both tiers cap one root domain at three candidates and cap existing-link reclamation at 20% of the tier. A candidate must have a safe public `target_url` and external `evidence_url`, a matching external `root_domain`, a declared opportunity type, a non-empty acquisition route, and an actionable next step. The validator defaults to `full`; pass `--tier minimum` only when that reduced but still useful research scope is honestly reported.

The count is a research-coverage requirement, not a claim that all targets will publish a link. Keep lower-confidence leads visibly separate from targets ready for outreach. Do not use low-quality sources to meet either tier.

## Evidence standard

- Existing-link evidence: retain the live external source page and confirm the outgoing reference where technically accessible. Classify it as `existing_link_reclamation`; do not count it as a new prospect.
- Submission evidence: retain the public program, policy, or application page. Record any required sample, fee, disclosure, or eligibility condition.
- Editorial-target evidence: retain a current, relevant article or section. Do not assume that an editor accepts pitches.
- Research lead: retain the discovery source and state exactly what must be checked before contact.

## Exclusions

Exclude sources that sell ranking links, demand undisclosed payment for editorial placement, mass-generate pages, host misleading coupon content, or do not offer a realistic route. Keep exclusions in the output so the merchant can see that they were screened rather than missed.

## Public-web safety

Validate redirect hops and final destinations before fetching. Do not access private address ranges, local services, restricted pages, or pages requiring a bypass. Respect robots and publication rules. Store only the public URLs and concise evidence required for this run.

The ledger validator checks record structure and direct literal hosts. It does not replace redirect-hop or DNS validation while collecting public-web evidence.
