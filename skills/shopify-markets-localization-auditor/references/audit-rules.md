# Audit Rules

Use this reference before writing findings, scores, or fix plans.

## Severity Buckets

Use only these user-facing buckets:

- `做得好的地方`
- `优先补足`
- `继续优化`
- `需要人工确认`

Keep internal severity simple:

- `high`
- `medium`
- `manual`

## Locale Findings

Raise `high` when:

- a market language is not published
- a market main language is not enabled
- readiness is below `70%`

Raise `medium` when:

- readiness is from `70%` to `89%`
- more than `10%` of fields are stale
- a published language is not attached to any market

Raise `manual` when:

- the locale exists but there is not enough evidence to decide which market should own it

## Market Findings

Do not mark a market wrong only because it serves multiple countries or multiple languages.

Raise `medium` instead when:

- the market groups many countries and the language setup looks thin
- the market has no dedicated web presence
- the market uses one main language even though several large language groups are present

Raise `high` when:

- the market main language is unpublished
- the market references a language that is not enabled

## Shipping Findings

Raise `high` when:

- a market country has no shipping-zone coverage

Raise `manual` when:

- shipping profiles exist but mapping to the market is unclear

## Storefront Findings

Raise `high` when:

- no `hreflang` links are found on a localized store
- no canonical link is found

Raise `medium` when:

- policy links are missing from common store pages

Raise `manual` when:

- a theme-side international UX item needs human review

## Strategy Suggestions

Keep market expansion suggestions in plain language:

- show the current language count
- show the remaining language slots out of `20`
- suggest new markets only after considering what the store actually sells
- allow replacing weak markets with stronger ones, but treat that as a recommendation, not a fix

Before writing any category or country suggestion:

- identify the store type from `shop.name`, `shop.description`, collection names, visible product names, and at least one product-detail page when possible
- use at least `3` external references if the advice claims category-country opportunity
- prefer industry associations, government trade reports, or category research over generic blogs
- if a claim is seasonal or region-specific, say whether it is `evidence` or `inference`
- avoid default advice like `just add more languages` unless it is connected to a specific country demand pattern

The business suggestion block should answer:

- what this store mainly sells
- who is most likely to buy it
- which countries look strongest for this category
- why those countries fit this category
- what the merchant should do in Markets, languages, pricing, or policies because of that fit

Use this wording style:

- `You already cover 8 languages. Shopify allows up to 20 published extra languages. That leaves room for 12 more.`
- `This market is not broken, but it is carrying too many countries for one setup.`
- `People can reach the store, but they are not getting a clearly local experience yet.`
- `这个市场不是坏的，只是还没有做成更本地化的体验。`
- `这里没有看到明显故障，但还有优化空间。`
- `建议顺手检查一下前端是否有国家/语言切换器，以及后台是否开启了自动定向。`
- `这家店卖的是宠物出行用品，所以国家建议不能只看宠物数量，还要看自驾、城市小户型、以及对安全和便携的消费习惯。`

## Fix Plan Rules

The fix bundle must be short and reviewable.

Each action needs:

- `title`
- `summary`
- `risk`
- `mutation`
- `variables`
- `execute_supported`

If the action changes URL structure, countries inside a market, or translation content:

- do not include it in the executable bundle
- place it under guided next steps instead
