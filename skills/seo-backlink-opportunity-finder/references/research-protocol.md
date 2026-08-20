# Research protocol

## Contents

1. [Operating model](#operating-model)
2. [Two mandatory discovery engines](#two-mandatory-discovery-engines)
3. [Search matrix](#search-matrix)
4. [Opportunity lanes](#opportunity-lanes)
5. [Candidate ledger](#candidate-ledger)
6. [Quality tiers](#quality-tiers)
7. [Evidence and exclusions](#evidence-and-exclusions)
8. [Public-web safety](#public-web-safety)

## Operating model

The target is a set of new external links that the merchant can realistically pursue. Existing links and unlinked mentions are useful diagnostics, but they are not the main deliverable.

Use this order:

```text
public target site
  -> category/topic/market context
  -> category + backlink-intent query families
  -> comparable brands
  -> comparable brands' public external referring pages
  -> reproducible new prospects
  -> small reclamation queue
```

The two first-class discovery methods are:

- `category_led_prospecting` — expand the target's real category, problem, use-case, audience, asset, and geography terms with source/link-type modifiers.
- `competitor_link_path_prospecting` — discover comparable brands, inspect their public external referring pages, and turn only repeatable routes into new prospects.

Both methods must appear in the research log and in the new-prospect candidates. A run that only searches the target brand's mentions is incomplete, even if it finds many existing links.

## Two mandatory discovery engines

### A. Category-led prospecting

Start with a local seed map, not a fixed ecommerce category. Generate at least these seed families where applicable:

| Seed family | What to extract |
| --- | --- |
| Category | category, subcategory, material, format, product type |
| Problem/use case | task solved, buying reason, use situation, pain point |
| Audience | buyer role, profession, community, customer segment |
| Asset | guide, research, data, calculator, template, glossary, case study |
| Market | country, city, language, local spelling, trade terminology |
| Brand/product | brand, product line, distinctive phrase, named method |

Combine each useful seed with several backlink-intent modifiers. Search for direct source pages or programs, then inspect whether the target has a legitimate reason to be included.

Examples of query families, adapted to the target's real language:

```text
"[category]" (resources OR references OR citations OR links)
"[use case]" (guide OR toolkit OR template OR statistics)
"[audience]" "[category]" (expert OR association OR publication)
"[category]" (magazine OR newsletter OR podcast OR interview)
"[category]" (partners OR suppliers OR retailers OR stockists)
"[category]" (showcase OR awards OR conference OR expo)
"[product/use case]" (review OR comparison OR creator OR affiliate)
"[topic]" (outdated OR "broken link" OR replacement)
site:[relevant-domain] "[category]"
intitle:[topic] (resources OR guide OR directory)
```

Do not rely on “write for us,” “submit your site,” or “free directory” queries alone. They are discovery hints, not quality evidence.

### B. Comparable-brand link-path prospecting

Use this procedure for every run:

1. Discover several comparable brands with category, use-case, audience, and geography searches.
2. Verify each comparable brand's product, market, and relevance from its public site.
3. Search for external pages using combinations of the brand name, domain, product names, and source-type modifiers:

```text
"[competitor brand]" -site:[competitor-domain]
"[competitor domain]" -site:[competitor-domain]
"[competitor brand]" (recommended OR resources OR partners OR suppliers)
"[competitor brand]" (review OR comparison OR interview OR podcast)
"[competitor brand]" (award OR showcase OR event OR association)
"[competitor product]" "[category]" -site:[competitor-domain]
```

4. Open and inspect each external referring page. Record the exact page, the observed inclusion/link, the page type, and the route that made the competitor eligible.
5. Ask whether the target has a comparable asset, product, expertise, partnership, or story. If yes, create a new prospect for the external page; if not, retain it as a rejected or research-only lead with the missing requirement.
6. Confirm the source does not already link to the target. A competitor's link is evidence of a possible route, never evidence of an existing target link.

Public search cannot prove exhaustive backlink coverage. Use language such as “publicly observed referring page” and cite the direct page. Never claim “all competitor backlinks” without a dedicated index and a stated scope.

## Search matrix

Use multiple distinct checks, not one query repeated with minor spelling changes. The run log should preserve the actual query, source check, or direct-page check for auditability.

Backlink-intent modifiers to combine with target seeds or competitor tokens include:

```text
resources, references, citations, links, guide, toolkit, template, glossary,
expert, association, publication, magazine, newsletter, podcast, interview,
partners, suppliers, retailers, stockists, customer story, case study,
showcase, awards, conference, expo, event, review, comparison, creator,
affiliate, statistics, research, tool, calculator, directory, replacement,
outdated, broken
```

Use source-type checks across:

- independent editorial and buyer resources;
- expert, academic, professional, and reference resources;
- trade, business, local, and specialist media;
- partners, suppliers, retailers, customers, and collaborators;
- events, showcases, awards, associations, and memberships;
- reputable free business or industry listings;
- creator, affiliate, podcast, newsletter, and video coverage with disclosure;
- broken, outdated, or incomplete resource replacement.

For each source, capture a direct page URL. Search-result pages, a domain home page, or a vague search phrase are not sufficient evidence for a final candidate.

## Opportunity lanes

The ledger uses these lanes:

1. `own_mentions_and_reclamation` — existing mentions, unlinked mentions, redirects, and broken-link recovery; secondary only.
2. `target_site_citable_resources` — external pages that could cite a real target guide, dataset, tool, template, glossary, or research asset.
3. `supplied_competitor_links` — paths discovered from user-supplied competitor domains.
4. `comparable_brand_paths` — paths discovered from comparable brands found during research.
5. `independent_editorial` — relevant editorial, buyer, comparison, and specialist coverage.
6. `expert_and_reference_resources` — expert organizations, professional resources, and reference pages.
7. `trade_and_business_media` — trade, professional, local, and business publications.
8. `partnerships_and_collaborators` — suppliers, retailers, customers, collaborators, and partner pages.
9. `events_showcases_and_awards` — events, showcases, awards, associations, and memberships.
10. `reputable_listings` — reputable free business or industry listings with a real audience.
11. `creator_and_affiliate_coverage` — creators, affiliates, podcasts, newsletters, and video publishers with clear disclosure.
12. `replacement_opportunities` — broken, outdated, or incomplete resources that the target can genuinely improve.

The first two mandatory discovery methods can populate several lanes. Do not confuse a lane with a method: `comparable_brand_paths` describes the opportunity type, while `competitor_link_path_prospecting` describes how it was discovered.

## Candidate ledger

Keep one JSON object with `target_root_domain`, `research`, and `candidates`:

```json
{
  "target_root_domain": "example.com",
  "research": {
    "tier": "minimum",
    "category_seeds": ["real category seed", "real use-case seed"],
    "competitor_domains": ["competitor.example"],
    "method_checks": {
      "category_led_prospecting": ["query or source check 1"],
      "competitor_link_path_prospecting": ["query or source check 1"]
    },
    "lane_checks": {
      "independent_editorial": ["direct-page or query check 1"]
    },
    "omitted_lanes": ["lane omitted from minimum run"]
  },
  "candidates": []
}
```

Each candidate needs:

```text
id, target_url, root_domain, opportunity_type, lane, discovery_method,
route, evidence_state, evidence_url, why_relevant, next_action,
cost_or_disclosure, quality_risk
```

Field semantics:

- `target_url` is the owned page that should receive the link.
- `evidence_url` is a direct public page on the external source site that supports the prospect or route. It must not be a search-result page or a page on the target site.
- `root_domain` is the normalized root domain of the external source site.
- `discovery_method` records how the opportunity was found, not how the merchant will acquire it.

Allowed `opportunity_type` values:

- `new_prospect` — a new external acquisition opportunity; the target is not presented as already linked from the source.
- `existing_link_reclamation` — an existing link, unlinked mention, correction, redirect, or broken-link recovery path for the target site.

Allowed `discovery_method` values:

- `category_led_prospecting`
- `competitor_link_path_prospecting`
- `comparable_brand_discovery`
- `editorial_research`
- `expert_reference_research`
- `trade_media_research`
- `partner_collaborator_research`
- `event_award_research`
- `listing_research`
- `creator_affiliate_research`
- `replacement_research`
- `existing_mention_search`

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

For a `new_prospect`, `discovery_method` must be one of the new-prospect methods, `route` must not be `link_reclamation`, and `evidence_state` must not be `verified_existing_link`. For an `existing_link_reclamation`, use the own-mentions lane, `link_reclamation`, and either verified existing-link evidence or a clearly labeled research lead.

## Quality tiers

Choose the tier before drafting conclusions:

| Tier | Candidates | Root domains | Coverage lanes | New prospects | Method checks | Lane checks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `full` | at least 100 | at least 60 | all 12 | at least 80 | 8 per mandatory method | 8 per represented lane |
| `minimum` | at least 40 | at least 25 | at least 8 | at least 32 | 4 per mandatory method | 4 per represented lane |

Both tiers require at least 80% new prospects, cap one root domain at three candidates, and cap reclamation at 20% of all candidates. Both mandatory discovery methods must have checks and new-prospect candidates. For `full`, cover all lanes; for `minimum`, cover at least eight and list omitted lanes with reasons.

These are coverage gates, not promises that every source will publish a link. Keep verified routes, relevant editorial targets, and research leads visibly separate. Do not use weak sources to meet a count.

## Evidence and exclusions

Evidence standards:

- Existing-link evidence: open the external page and confirm the outgoing reference where technically accessible. Never call a mention a link without checking.
- Submission evidence: retain the public program, policy, or application page and record fees, samples, disclosure, and eligibility requirements.
- Editorial-target evidence: retain a current relevant article or section. Do not assume the editor accepts pitches.
- Research lead: retain a direct discovery page and state exactly what must be verified before contact. Do not put a generic domain or category into the main queue.

Exclude and report sources that sell ranking links, require undisclosed payment for editorial placement, mass-generate pages, host misleading coupon content, scrape content, or offer no realistic route. Keep exclusions visible so the merchant can distinguish screened sources from missed research.

## Public-web safety

Validate redirect hops and final destinations before fetching. Do not access private address ranges, local services, restricted pages, or pages requiring a bypass. Respect robots, terms, rate limits, and access controls. Store only public URLs and concise evidence needed for this run.

The ledger validator checks record structure, direct literal hosts, method coverage, ratio caps, and domain binding. It does not replace redirect-hop or DNS validation while collecting evidence.
