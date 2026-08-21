import { completed, finding, unavailable } from "../core/results.mjs";
import { safeShopifyRead } from "../core/graphql.mjs";
import { textLength } from "./helpers.mjs";

const QUERY = `query ContentTrustAudit($after: String) { pages(first: 100, after: $after) { nodes { id title handle body isPublished } pageInfo { hasNextPage endCursor } } }`;
const EXPECTED = [
  { id: "about", words: ["about", "our-story", "our_story"] },
  { id: "contact", words: ["contact", "contact-us", "contact_us"] },
  { id: "faq", words: ["faq", "help", "questions"] },
  { id: "tracking", words: ["track", "tracking", "order-status"] },
];

export async function audit({ config }) {
  if (!config) return unavailable("content_trust", "CONNECTION_NOT_CONFIGURED", "Page evidence requires an authorized Shopify Admin connection.");
  const pages = []; let after = null;
  for (let index = 0; index < 5; index += 1) {
    const read = await safeShopifyRead(config, QUERY, { after });
    if (!read.available) return unavailable("content_trust", read.code, read.error);
    pages.push(...(read.data.pages?.nodes || []));
    if (!read.data.pages?.pageInfo?.hasNextPage) break;
    after = read.data.pages.pageInfo.endCursor;
  }
  const findings = EXPECTED.map((expected) => {
    const page = pages.find((candidate) => expected.words.some((word) => `${candidate.handle} ${candidate.title}`.toLowerCase().includes(word)));
    const adequate = page?.isPublished && textLength(page.body) >= 80;
    return finding({ module: "content_trust", id: `page-${expected.id}`, severity: adequate ? "pass" : "warning", title: adequate ? `${expected.id} content page is published.` : `${expected.id} content page is missing, unpublished, or sparse.`, evidence: { pageId: page?.id || null, handle: page?.handle || null, published: page?.isPublished || false, textLength: textLength(page?.body) }, source: "admin_api", weight: 1, fix: adequate ? null : { action: page ? "page_update" : "page_create", resourceId: page?.id || null, merchantContentRequired: true } });
  });
  return completed("content_trust", findings, { source: "admin_api", inspectedPages: pages.length });
}
