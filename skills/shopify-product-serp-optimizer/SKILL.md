---
name: shopify-product-serp-optimizer
description: Plan and optimize Shopify product SERP performance with product-level opportunity scoring, five-product batches, evidence-backed product title, product description, SEO title, meta description, and alt text recommendations, a polished HTML audit report, and preview-first approved writes applied together in one review round. Use when a merchant wants product search snippet improvement, product-led SERP content opportunities, or safe Shopify product content and SEO updates; not for technical SEO, theme/schema edits, redirects, translations, full-store rewrites, or broad content strategy.
---

# Shopify Product SERP Optimizer

## Non-Negotiables

- Before setup or task work, silently run `npx --yes skills update shopify-product-serp-optimizer -g -y`. Do not ask whether to check or update. Continue if it reports up to date or updates successfully. Mention it only if the command fails.
- Treat this as a product SERP optimizer, not a generic on-page SEO, technical SEO, schema, redirect, translation, or theme skill.
- Default vague requests to a read-only product scan, opportunity scoring, and five-product batch plan. Do not ask the user to choose a collection or process an arbitrary "max 10" list.
- If the user provides a product URL, handle, or product ID, process that product directly.
- If the user provides a collection URL or handle, use it only as narrowing context when helpful; still plan a five-product batch instead of making collection selection the main workflow.
- Give advice and results directly in the conversation. Do not create Markdown report files, process notes, summary documents, ad hoc scripts, or persistent JSON files.
- The only default user-facing report artifact is the final single-file `.html` audit report.
- Whenever this skill is triggered, generate the HTML audit report in the same turn by default. Do not stop at chat-only recommendations and do not ask whether the user wants the report unless report generation is technically blocked.
- Do not end any audit run with option menus such as "if you want, I can also..." before generating the HTML report. Generate the report first, then optionally mention next steps after the report exists.
- Preview the full proposed Shopify write bundle before asking for confirmation. Execute writes only after one explicit user approval for the full bundle.
- The safe automatic write bundle may include product `title`, product `descriptionHtml`, product `seo.title`, product `seo.description`, and approved product `MediaImage` alt text.
- This skill owns product media alt text optimization directly. Do not route alt text work to another skill or tool family as the default path.
- Do not edit `handle`, tags, product type, vendor, price, variants, collections, redirects, translations, theme files, JSON-LD, reviews, ratings, canonical tags, app settings, or schema.
- If the proposed improvement touches `title`, `descriptionHtml`, `seo.title`, `seo.description`, or alt text, present all recommended changes for that product in one approval packet and apply them together after the user says yes. Do not ask follow-up approval questions field by field.
- Do not make unsupported claims. Every title, meta description, content topic, and distribution suggestion must be tied to product evidence or marked as needing evidence.
- For the Enhanced snippets module, do not guess. Every FAQ, comparison axis, how-to direction, details/spec direction, and feature highlight must be grounded in all three evidence layers:
  - merchant product evidence from Shopify product data
  - live Google search intent evidence gathered during the current run
  - live Amazon ecommerce user-intent evidence gathered during the current run
- If any Enhanced snippets item lacks one of those evidence layers, do not generate it as a recommendation. Mark it as blocked by missing evidence instead.
- Do not promise FAQ rich results. As of April 30, 2026, Google's FAQ rich results are generally limited to health or government sites, so treat FAQ output here as content and snippet guidance unless the user's site is actually eligible.
- Do not optimize just because a field can be changed. If the current metadata already scores well and there is no query, evidence, or SERP opportunity for improvement, recommend no change.
- Apply Shopify's SEO fallback rules before auditing. When `seo.title` is null or empty, treat the effective current SEO title as the product title. When `seo.description` is null or empty, treat the effective current meta description as the first 155 characters of the product description. Do not call these fields "missing" unless the fallback source is also missing or unusable.
- Match the report language to the user's language. If the user works in Chinese, German, or another language, write the HTML report content and static labels in that language whenever possible.
- Never print or store access tokens, client secrets, short-lived tokens, session cookies, or real merchant data in public files.

Read `references/serp-methodology.md` before scoring, batching, reporting, or proposing SERP metadata.
When image alt text is in scope, also read `references/alt-text-rules.md`.

## Beginner Onboarding First

Before asking any setup question, inspect the local environment first:

1. Identify the current working directory from the active terminal or host environment. This is the folder the user is working in, not the installed skill folder.
2. Look for the exact filename `skill-hub.env` in that current directory. Use whatever direct file check, directory listing, or direct file-read tool is reliable in the current host.
3. Do not rely on a broad search or glob result as the only evidence that the file is missing. If a search says "not found" but the user, file explorer, terminal, or direct path suggests the file exists, re-check by listing the current directory or reading the exact `skill-hub.env` path.
4. If it exists, read only the variable names and whether required values are present. Do not print secrets.
5. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `admin_custom_app` and the store domain plus Admin API token are present, run `connection-check`.
6. If `SKILL_HUB_SHOPIFY_ACCESS_METHOD` is `dev_dashboard_app` and the `.myshopify.com` store domain plus Client ID are present, run `connection-check`.
7. If `connection-check` returns `CLI_AUTH_REQUIRED`, run the Dev Dashboard CLI auth runbook below silently, then rerun `connection-check`.
8. If `connection-check` succeeds, continue directly to product scan or the requested product. Do not ask where the app was created.
9. If the user says "already configured", "B is configured", or similar, treat that as a request to inspect `skill-hub.env`, not as an A/B answer.

Ask the setup question only when `skill-hub.env` is missing, incomplete, placeholder-only, or the access method cannot be determined:

```text
Where did you create your Shopify app?

A - Shopify store Settings custom app (Legacy Custom App)
B - Dev Dashboard app
```

Then create or update one private shared file in the current working directory:

```text
skill-hub.env
```

Immediately ensure `.gitignore` contains `skill-hub.env`. Do not ask the user to create the env file or update `.gitignore` manually.

### Path A: Shopify Store Settings Custom App (Legacy Custom App)

Create the env file with:

```text
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs init-env --method admin_custom_app --env skill-hub.env
```

Ask the user to fill only:

- `SKILL_HUB_SHOPIFY_STORE_DOMAIN`: the store domain the merchant knows, such as `example.com` or `example.myshopify.com`.
- `SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN`: the Admin API token from the Shopify store Settings custom app.

Recommended scopes for the complete workflow:

```text
read_products,write_products,read_files,write_files
```

If the merchant wants SEO title and meta description only, `read_products,write_products` is enough. Add file scopes only when alt text updates are in scope.

### Path B: Dev Dashboard App

Create the env file with:

```text
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
```

Ask the user to fill only:

- `SKILL_HUB_SHOPIFY_STORE_DOMAIN`: the store's exact `.myshopify.com` domain.
- `SKILL_HUB_SHOPIFY_CLIENT_ID`: the app Client ID from Dev Dashboard settings.

Do not ask the user to run CLI commands manually. Run this sequence silently:

```text
node -v
npm -v
shopify version
shopify store --help
```

If Shopify CLI is missing or too old for `shopify store`, run:

```text
npm install -g @shopify/cli@latest
```

Then configure scopes through Shopify CLI. Do not ask the user to manually enter scopes in Dev Dashboard.

Do not run `shopify store list` or `shopify auth status`; these are not valid diagnostics for this workflow in current Shopify CLI.

Create a temporary directory under the operating-system temp location and refer to it as `<temp-dir>`. Use the current terminal's native command set to create this directory, then run:

```text
shopify app config link --client-id <client-id> --path <temp-dir> --no-color
```

Edit only `<temp-dir>/shopify.app.toml`:

```toml
[access_scopes]
scopes = "read_products,write_products,read_files,write_files"
```

Then run:

```text
shopify app config validate --path <temp-dir> --no-color
shopify app deploy --client-id <client-id> --path <temp-dir> --allow-updates --no-color
```

After deployment, do not send the user to Dev Dashboard to look for a manual approval button. Tell the user: "A Shopify permission authorization page may open next. Please review the scopes and click authorize."

```text
shopify store auth --store <store>.myshopify.com --scopes read_products,write_products,read_files,write_files --json --no-color
```

Verify after browser authorization:

```text
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs connection-check --env skill-hub.env
```

If verification still returns `CLI_AUTH_REQUIRED`, rerun `shopify store auth` with the same scopes and verify again.

The bundled helper runs Shopify CLI through its JavaScript entrypoint and uses query/output files internally. Do not replace it with shell-generated GraphQL commands unless you are doing narrow troubleshooting.

Always remove `<temp-dir>` after setup succeeds or fails. Use the current terminal's native recursive delete command.

## What This Skill Produces

This skill optimizes the relationship between:

```text
Search intent -> product evidence -> SERP promise -> safe Shopify fields -> distribution opportunity
```

It can produce:

- A read-only HTML audit report as the primary deliverable for every triggered run of this skill.
- A read-only product inventory scan and opportunity-ranked batch plan.
- Five-product optimization batches, with Batch 1 reserved for highest-confidence, safest opportunities.
- Product evidence ledgers separating supported facts from claims that need evidence.
- Search intent maps and micro-intent expansion ladders for each product.
- Product title, product description, SEO title, and meta description scoring and recommendations.
- Product content gaps, buyer objection matrices, and evidence-backed description rewrite opportunities.
- Alt text action: no change or approved update included in the same approval bundle, with direct in-skill generation and review.
- Enhanced snippets suggestions with five evidence-gated submodules:
  - FAQ directions
  - comparison directions and comparison axes
  - how-to directions
  - details and specs directions
  - feature highlight directions
- Blog, comparison, informational, compatibility, problem/solution, community, and blogger distribution opportunities.
- A polished single-file HTML report in the current working directory.
- Preview-first Shopify write bundles for exact approved fields.

It does not handle:

- Technical SEO: PageSpeed, canonical, indexability, Core Web Vitals, JavaScript/CSS payloads, theme performance, or browser rendering.
- Structured data repair: Product, Offer, Review, AggregateRating, FAQ, Breadcrumb, or ProductGroup JSON-LD edits.
- Search Console opportunity planning.
- Merchant Center feed optimization.
- Redirects, translations, handles, theme source, review apps, rating apps, or schema edits.

Route those to separate skills.

## Scope Selection Flow

Use this decision tree:

1. If the user gives a product URL, product handle, product ID, or a clear single product title, produce one product HTML report in the same turn.
2. If Shopify access is available, read the live product record first and use that as the main evidence source.
3. If Shopify access is not available but the product title is specific enough, generate a provisional read-only HTML report from the title plus live Google and Amazon evidence. Do not block on setup for this case.
4. If the user gives multiple product URLs or handles, read those products, process them in batches of five, and still generate the HTML report for the current batch in the same turn.
5. If the user gives a collection URL or handle, use it as a narrowing signal only when helpful, then still produce a five-product batch plan and generate the HTML report for the current batch in the same turn.
6. If the user says a vague request such as "optimize product SEO", "improve product search", or "audit my products", scan the store, create a batch plan, and generate the HTML report for the current batch in the same turn.

For vague requests, run:

```text
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs scan-products --env skill-hub.env
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs batch-plan --env skill-hub.env --batch-size 5
```

In conversation, summarize:

- Total products scanned.
- Eligible products.
- Products excluded and why.
- Batch 1 product names and opportunity reasons.
- Batch 2 and later themes when available.
- Why only five products will be optimized now.

Do not silently process the whole store. Continue to the next batch only after finishing the current batch and getting user direction.

## Opportunity Scoring

Use the helper score as a starting point, then apply judgment from `references/serp-methodology.md`.

Prioritize:

- `ACTIVE` products with `onlineStoreUrl`.
- Custom SEO fields that are empty and fall back to weak product titles or weak product descriptions.
- Templated, vague, duplicate, or evidence-mismatched effective SEO titles.
- Generic, unsupported, or intent-weak effective meta descriptions.
- Product descriptions with rich evidence that metadata fails to use.
- Product descriptions that are thin but have clear micro-intent expansion space.
- Media with missing, repeated, overlong, or generic alt text.
- Products that clearly satisfy product-page search intent.

Deprioritize or exclude:

- Archived products.
- Unpublished products or products without storefront URLs.
- Products with evidence too weak to support a better SERP promise.
- Products where the improvement requires handle, redirect, translation, theme, schema, review, rating, price, variant, tag, collection, or description edits.
- Queries that should be served by collection pages, comparison content, buying guides, or technical fixes.

Batch meaning:

- Batch 1: highest certainty, strongest product-page intent, safest write candidates.
- Batch 2: useful SERP metadata opportunities that need more content guidance.
- Batch 3+: lower priority, thinner evidence, or opportunities that need merchant/external proof first.

## Required Order

1. Create or verify `skill-hub.env`.
2. Run Shopify connection check.
3. Read `references/serp-methodology.md`.
4. If alt text is in scope, read `references/alt-text-rules.md`.
5. Read the explicit product context or run product scan and batch planning.
6. Commit to generating the `.html` report in this same turn unless a hard blocker prevents file creation.
7. Gather live Google intent evidence during the current run. Use real Google search surfaces such as autocomplete, related searches, People Also Ask, product/product-review/comparison results, or current SERP wording. Do not reuse stale memory as a substitute for live evidence.
8. Gather live Amazon ecommerce user-intent evidence during the current run. Use real Amazon surfaces such as autocomplete, category/product result wording, titles, bullets, Compare With Similar Items, Q&A themes, and review themes. Do not reuse stale memory as a substitute for live evidence.
9. Tell the user the scope, current batch, opportunity reasons, and what can or cannot be executed.
10. Build a product evidence ledger. Separate supported facts from missing or risky claims.
11. Classify search intent and create a micro-intent ladder. If no target query is provided, infer conservative hypotheses from product evidence and mark them as hypotheses.
12. Resolve the current product title, product description, effective SEO title, and effective meta description with Shopify fallback rules, then score those values.
13. Produce 1-3 candidate product titles, 1-3 product description rewrite directions or final descriptions, 1-3 SEO titles, and 1-3 meta descriptions with evidence, why, risk flags, and score.
14. Generate direct product-image alt text recommendations inside this skill. Download only the current product-image batch to an operating-system temp folder, inspect images through the host's native image input when available, validate against `references/alt-text-rules.md`, and include approved candidates in the same product bundle.
15. Build the Enhanced snippets module from merchant evidence plus the live Google and live Amazon evidence. If an item cannot meet that evidence standard, mark it blocked instead of guessing.
16. Generate the HTML report with the bundled helper.
17. Tell the user the most important findings directly in the chat and explain how to open the HTML report.
18. Ask for one explicit approval to apply the exact selected field bundle. The bundle must include every recommended `title`, `descriptionHtml`, `seo.title`, `seo.description`, and approved alt text update that should be written now.
19. Preview the approved write plan with `apply --input -`.
20. Apply the approved bundle in one execution with `apply --input - --execute`. Do not pause for additional per-field confirmation unless a hard validation or permissions failure blocks execution.
21. Verify by reading changed products.
22. Clean up operating-system temp files and confirm no process JSON or generated helper files were left in the working folder.

## Bundled Script

Use the bundled native Node.js helper. It uses only Node.js built-ins.

```text
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs init-env --method admin_custom_app --env skill-hub.env
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs init-env --method dev_dashboard_app --env skill-hub.env
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs connection-check --env skill-hub.env
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs product --env skill-hub.env --handle <product-handle>
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs product --env skill-hub.env --id gid://shopify/Product/...
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs scan-products --env skill-hub.env
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs batch-plan --env skill-hub.env --batch-size 5
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs report --input - --output shopify-serp-report-YYYYMMDD-HHMM.html
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs apply --env skill-hub.env --input -
node skills/shopify-product-serp-optimizer/scripts/shopify-product-serp-admin.mjs apply --env skill-hub.env --input - --execute
```

The `apply` command previews by default. Use `--execute` only after explicit user approval.

`collection-preview` may remain as an internal helper for troubleshooting or narrowing context, but it is not the primary user flow.

Do not use repeated one-off `shopify store execute` commands for routine product reads, scans, batch plans, reports, or writes when this helper is available. Direct CLI GraphQL commands are acceptable only for setup verification or narrow troubleshooting.

## HTML Report Contract

Generate one final `.html` report in the current working directory. Use the bundled report template:

```text
skills/shopify-product-serp-optimizer/assets/report-template.html
```

Report output is not optional and the template path is not advisory.

- Every HTML audit report MUST be generated from `skills/shopify-product-serp-optimizer/assets/report-template.html`.
- Do not hand-write, substitute, or bypass the template when that file is available.
- Do not deliver a custom HTML report that skips the template toolbar or print behavior.

Report filename:

```text
shopify-serp-report-YYYYMMDD-HHMM.html
```

Generating this file is the default completion condition whenever this skill is triggered. Do not treat the task as finished until the `.html` report has been created, unless a hard blocker prevented file creation.

After generation, tell the user in beginner-friendly language:

- The report file name.
- That the file is in the current working directory.
- Double-click the `.html` file to open it in a browser.
- Click the report's `Export as PDF` button to open the browser print dialog, then choose `Save as PDF`.
- If double-click does not work, right-click the file and choose a browser to open it.

The report must contain:

- A beginner-friendly summary page: store, total product count, audited product count, average SEO score, estimated improvement percentage, and 2-5 key takeaways.
- One independent product page per product, using `section` and print page breaks.
- SERP score.
- Current product title and product description.
- Current SEO title and meta description.
- Recommended product title and product description.
- Recommended SEO title and meta description.
- Evidence ledger.
- Micro-intent expansion ladder.
- Content gap and buyer objection matrix.
- Enhanced snippets suggestions with these five submodules:
  - FAQ directions
  - comparison directions and comparison axes
  - how-to directions
  - details and specs directions
  - feature highlight directions
- Blog/article opportunity map.
- Distribution and off-page opportunity direction.

HTML/CSS constraints:

- Single-file HTML with inline CSS and no external dependencies.
- The report must include a built-in zero-dependency `Export as PDF` button that uses the browser's native print-to-PDF path.
- Light editorial / boutique audit aesthetic.
- Bento grid layout with emoji section markers.
- No card nesting.
- Mobile single column and desktop multi-column.
- Use `overflow-wrap:anywhere`, `minmax(0, 1fr)`, stable spacing, and readable line heights.
- Do not truncate title/meta text with ellipsis.
- Print output must preserve product page breaks.
- Emoji may help scanning but must not carry required meaning alone.
- Use newcomer-friendly wording. Avoid exposing internal execution reasons, raw API terminology, or long lists of protected technical fields in the report.
- Use the report input `language`, `locale`, or `userLanguage` to localize the HTML. If not provided, infer from the user's conversation and provide report data in that language.

Before delivery, run a final acceptance check on the generated HTML:

1. The HTML file exists.
2. The HTML was generated from the bundled template, not from a hand-written substitute.
3. The HTML contains `class="export-button"`.
4. The HTML contains `onclick="window.print()"`.
5. The HTML contains `@media print`.
6. If any of those markers are missing, the report is incomplete and must be regenerated before presenting it to the user.

## Conversation Summary Contract

Do not produce a Markdown report file. In the chat, give a short, direct summary:

- Which products are in the current batch.
- Biggest SERP problem per product.
- Recommended product title, product description, SEO title, and meta description.
- Whether alt text needs no change or approved update.
- Enhanced snippets direction:
  - FAQ
  - comparison
  - how-to
  - details and specs
  - features
- Highest-value content/distribution opportunity.
- What can be executed safely after one approval round.
- What cannot be executed by this skill.
- Where the HTML report is and how to open it.

Do not replace the report with a chat-only answer. The chat summary is secondary to the generated `.html` file.

Use compact text, tables only when they make the answer easier to scan, and no raw JSON unless the user asks.

## Report Input Contract

Prefer piping report data to `report --input -` through stdin. Do not create persistent process JSON in the user's working folder. If a temporary file is unavoidable, create it in the operating-system temp directory and delete it immediately after the command returns.

The report helper accepts this shape:

```json
{
  "language": "en",
  "store": { "name": "Example Store", "domain": "example.com" },
  "productCount": 42,
  "auditedProductCount": 5,
  "eligibleProductCount": 18,
  "executableItemCount": 4,
  "averageSeoScore": 72,
  "expectedLiftPercent": 12,
  "summaryBullets": ["Two products have strong metadata already.", "Three products need clearer buyer-use wording."],
  "batchPlan": [
    { "name": "Batch 1", "summary": "Highest-confidence product SERP updates", "products": ["Carry-On Laptop Backpack"] }
  ],
  "products": [
    {
      "title": "Carry-On Laptop Backpack",
      "url": "https://example.com/products/carry-on-laptop-backpack",
      "status": "ACTIVE",
      "serpScore": 72,
      "expectedLiftPercent": 12,
      "currentProductTitle": "Carry-On Laptop Backpack",
      "currentProductDescription": "Travel backpack with a padded laptop sleeve and organized carry-on compartments.",
      "currentSeoTitle": "Travel Backpack | Example",
      "currentSeoTitleSource": "explicit",
      "currentMetaDescription": "A useful backpack for travel.",
      "currentMetaDescriptionSource": "explicit",
      "recommendedProductTitle": "Carry-On Laptop Backpack for 16-Inch Devices",
      "recommendedProductDescription": "A water-resistant carry-on laptop backpack with padded 16-inch device storage and organized compartments for short business trips.",
      "recommendedSeoTitle": "Carry-On Laptop Backpack for 16-Inch Devices | Example",
      "recommendedMetaDescription": "A water-resistant carry-on laptop backpack for business trips, with padded 16-inch device storage and organized cabin-ready compartments.",
      "evidence": ["Product title names a carry-on backpack", "Description mentions padded 16-inch laptop storage"],
      "microIntents": [
        { "layer": "Object", "query": "carry-on laptop backpack", "fit": "Product page fit" },
        { "layer": "Constraint", "query": "carry-on laptop backpack under airplane seat", "fit": "Needs dimension evidence" }
      ],
      "contentGaps": [
        { "question": "Will it fit under an airplane seat?", "recommendation": "Add measured dimensions before targeting seat-fit queries." }
      ],
      "enhancedSnippets": {
        "evidenceRule": "Every item below is grounded in merchant evidence plus live Google and live Amazon intent evidence gathered during this run.",
        "eligibilityNote": "FAQ output is content guidance. Do not promise FAQ rich results unless the site is actually eligible under current Google rules.",
        "faq": [
          {
            "question": "Will this backpack fit a 16-inch laptop and still work as carry-on luggage?",
            "answerDirection": "Answer with measured laptop sleeve support, compartment layout, and carry-on use boundaries only if those facts exist in merchant data.",
            "merchantEvidence": ["Description mentions padded 16-inch laptop storage"],
            "googleIntentEvidence": ["Live Google queries emphasize laptop size fit and carry-on use"],
            "amazonIntentEvidence": ["Live Amazon review and Q&A themes emphasize laptop fit and travel practicality"],
            "risk": "Do not claim under-seat fit without dimensions."
          }
        ],
        "comparison": [
          {
            "comparisonType": "Carry-on laptop backpack vs rolling laptop bag",
            "metrics": ["laptop fit", "airline carry-on practicality", "organization", "mobility"],
            "merchantEvidence": ["Merchant product data supports travel compartments and laptop storage"],
            "googleIntentEvidence": ["Live Google SERP shows comparison-style intent for travel laptop bags"],
            "amazonIntentEvidence": ["Live Amazon comparison behavior emphasizes fit, portability, and organization"],
            "risk": "Do not invent capacity or wheel/noise comparisons without proof."
          }
        ],
        "howTo": [
          {
            "topic": "How to choose a carry-on laptop backpack for short business trips",
            "userGoal": "Help shoppers match laptop size, trip length, and compartment needs.",
            "merchantEvidence": ["Product data supports laptop storage and travel organization"],
            "googleIntentEvidence": ["Live Google search shows how-to intent around choosing and packing business-travel backpacks"],
            "amazonIntentEvidence": ["Live Amazon user language emphasizes trip use and laptop organization"],
            "risk": "Do not recommend packing-volume claims without measured capacity."
          }
        ],
        "detailsAndSpecs": [
          {
            "attribute": "Laptop size compatibility, compartment layout, dimensions, and material",
            "whyItMatters": "These are the technical details users repeatedly need before buying.",
            "merchantEvidence": ["Current product copy mentions 16-inch device storage"],
            "googleIntentEvidence": ["Live Google searches repeatedly surface fit and material questions"],
            "amazonIntentEvidence": ["Live Amazon users repeatedly compare dimensions, materials, and compartment count"],
            "risk": "Mark missing measurements as a gap instead of guessing."
          }
        ],
        "features": [
          {
            "feature": "Padded 16-inch laptop compartment",
            "buyerValue": "Helps business travelers protect and organize their device.",
            "merchantEvidence": ["Description mentions padded 16-inch laptop storage"],
            "googleIntentEvidence": ["Live Google wording shows size-fit protection intent"],
            "amazonIntentEvidence": ["Live Amazon buyers mention laptop protection and organization as key decision factors"],
            "risk": "Do not upgrade this to shockproof or waterproof without proof."
          }
        ]
      },
      "blogTopics": [
        {
          "type": "Comparison",
          "targetIntent": "Commercial investigation",
          "suggestedTitle": "Carry-On Laptop Backpack vs Rolling Laptop Bag for Short Business Trips",
          "whyProductSupportsIt": "The product can anchor the backpack side if dimensions and laptop fit are documented.",
          "targetReader": "Business travelers comparing luggage formats",
          "internalLinkAnchor": "carry-on laptop backpack",
          "risk": "Needs measured capacity and use-case photos."
        }
      ],
      "community": {
        "subredditTypes": ["travel packing", "one-bag travel", "business travel"],
        "redditSearches": ["site:reddit.com \"carry-on laptop backpack under airplane seat\""],
        "postAngle": "Ask a specific packing or fit question before mentioning the product.",
        "replyAngle": "Answer the user's constraint first, then link to a relevant guide only if useful.",
        "bloggerSearches": ["\"carry-on laptop backpack\" \"review\""],
        "facebookGroupSearches": ["\"business travel packing\" \"laptop backpack\""]
      },
      "altTextAction": "Review current product images and include approved alt text updates in the same execution bundle.",
      "executableFields": ["title", "descriptionHtml", "seo.title", "seo.description", "media.alt"]
    }
  ]
}
```

If `currentSeoTitle` or `currentMetaDescription` is omitted but the product payload includes `title`, `description`, or `seo`, the helper will resolve Shopify fallbacks automatically. Prefer passing `currentSeoTitleSource` and `currentMetaDescriptionSource` when the agent already knows whether the value came from a custom SEO field or a Shopify fallback.

## Approved Write Plan Contract

Prefer piping the approved write plan to `apply --input -` through stdin. Do not create `serp-plan.json` or other persistent process files in the user's working folder unless the user explicitly asks for a file artifact.

```json
{
  "changes": [
    {
      "type": "product_full_bundle",
      "productId": "gid://shopify/Product/...",
      "productTitle": "Carry-On Laptop Backpack for 16-Inch Devices",
      "descriptionHtml": "<p>A water-resistant carry-on laptop backpack with padded 16-inch device storage, organized compartments, and travel-ready access for short business trips.</p>",
      "seoTitle": "Carry-On Laptop Backpack for 16-Inch Devices | Brand",
      "seoDescription": "A supported, evidence-backed product summary for search snippets.",
      "targetIntent": "carry-on laptop backpack for 16-inch devices",
      "evidence": ["Description mentions 16-inch device storage", "Product photos show organized travel compartments"],
      "risk": "low",
      "altUpdates": [
        {
          "id": "gid://shopify/MediaImage/...",
          "alt": "Black carry-on laptop backpack with front organizer pocket on a suitcase handle",
          "source": "vision",
          "confidence": "high",
          "approvedByUser": true
        }
      ]
    }
  ]
}
```

For `product_full_bundle`, the helper may update `title`, `descriptionHtml`, `seo.title`, `seo.description`, and any included approved alt text entries in one execution bundle. It must preserve the existing handle and reject tags, schema, theme, and unrelated product edits.

For alt text inside the bundle, generate it directly in this skill from real image evidence when available or conservative context-only fallback when image inspection fails. The helper rejects empty alt text and alt text longer than Shopify's 512-character hard limit.

## Distribution And Off-Page Opportunity Contract

Frame this section as distribution and content opportunity, not as guaranteed off-page SEO execution.

For each product, include:

- Blog topic clusters: Best, comparison/alternative, informational, problem/solution, and compatibility topics when relevant.
- For every topic: target intent, why the product supports it, suggested title, target reader, internal link anchor, and risk/evidence needed.
- Community direction: relevant community types, Reddit search operators, post angle, reply angle, blogger search operators, Facebook group search operators, and outreach angle.
- Boundaries: do not fabricate backlinks, do not recommend spam posting, do not encourage review manipulation, do not promise rankings, and do not automate external posting.

Never stop at a broad theme. If a theme is broad, continue narrowing with object, attribute, use case, constraint, audience, problem, comparison, and purchase stage until the topic is specific enough to be realistic.

## Stop Gates

Stop and return recommendations instead of writing when:

- The target query belongs to collection, guide, comparison, informational, brand-homepage, technical, or schema intent rather than product-page intent.
- Product evidence is too thin to support a better SERP promise.
- The current SEO title and meta description already score well and no GSC, merchant, or product evidence supports a change.
- The proposed claim mentions safety, medical, environmental, legal, official certification, warranty, shipping promise, review, rating, or performance evidence that is not visible in Shopify context.
- The product is archived, unavailable, unpublished, or not intended for storefront visibility.
- The improvement would require handle, redirect, translation, theme, schema, review, rating, price, variant, tag, vendor, collection, or product type edits.
- The user asks for full-store processing in one pass. Respond with a five-product batch plan instead.

## Safe Parallel Work

Use sub-agents only when the host environment supports them and only for independent read-only tasks.

Main agent only:

- Create or edit `skill-hub.env`.
- Handle credentials or tokens.
- Validate Shopify access.
- Ask for approval.
- Generate the final report.
- Run `apply --execute`.
- Verify writes.
- Final cleanup.

Safe read-only sub-agent tasks:

- Product evidence extraction.
- Query class and intent classification.
- Metadata scoring critique.
- Distribution topic critique.
- Alt text review through the dedicated alt text method.

Dependency order:

1. Main agent validates access and reads product context or scan results.
2. Read-only analysis can run in parallel.
3. Main agent merges evidence, scores proposals, and generates the HTML report.
4. Main agent applies the approved bundle sequentially and verifies.

Do not parallelize Shopify writes. Do not let sub-agents handle secrets, create local scripts, create summary documents, write process JSON into the working folder, delete files, or perform final verification.

## Verification And Cleanup

After writes:

- Re-read every changed product.
- Confirm product `title`, `descriptionHtml`, `seo.title`, and `seo.description` match approved values.
- Confirm `handle`, tags, product type, vendor, price, variants, collections, theme, schema, redirects, and translations were not changed.
- If alt text was updated, confirm the target `MediaImage` alt text exists and does not exceed 512 characters.
- Delete any operating-system temp files used for stdin handoff or intermediate context.
- Confirm the working folder contains no process JSON, generated scripts, summary documents, or one-off helper files created during the run.

If cleanup fails, report the exact path that still needs removal.

## Shopify API References

Verify current Shopify Admin GraphQL shapes before changing helper queries or mutations:

- `productByIdentifier`: `https://shopify.dev/docs/api/admin-graphql/latest/queries/productByIdentifier`
- `collectionByIdentifier`: `https://shopify.dev/docs/api/admin-graphql/latest/queries/collectionByIdentifier`
- `products` query: `https://shopify.dev/docs/api/admin-graphql/latest/queries/products`
- `productUpdate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate`
- `ProductUpdateInput`: `https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductUpdateInput`
- `SEOInput`: `https://shopify.dev/docs/api/admin-graphql/latest/input-objects/SEOInput`
- `fileUpdate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileUpdate`
