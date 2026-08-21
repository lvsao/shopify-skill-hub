import { completed, finding, unavailable } from "../core/results.mjs";
import { safeShopifyRead } from "../core/graphql.mjs";
import { extractMeta, fetchPublic } from "../core/public-fetch.mjs";

const DISCOUNT_QUERY = `query DiscountAudit { discountNodes(first: 100) { nodes { id discount { __typename ... on DiscountCodeBasic { title status summary } ... on DiscountAutomaticBasic { title status summary } ... on DiscountCodeFreeShipping { title status summary } ... on DiscountAutomaticFreeShipping { title status summary } } } } }`;

export async function audit({ config, storeUrl }) {
  const findings = [];
  if (config) {
    const read = await safeShopifyRead(config, DISCOUNT_QUERY);
    if (read.available) {
      const discounts = read.data.discountNodes?.nodes || [];
      for (const node of discounts) {
        const text = `${node.discount?.title || ""} ${node.discount?.summary || ""}`;
        const risky = /100\s*%|free.{0,20}(order|shipping)|unlimited/i.test(text);
        findings.push(finding({ module: "marketing_discounts", id: `discount-${node.id}`, severity: risky ? "warning" : "pass", title: risky ? `Discount “${node.discount?.title || node.id}” requires a manual risk review.` : `Discount “${node.discount?.title || node.id}” has no simple extreme-discount signal.`, evidence: { id: node.id, type: node.discount?.__typename, status: node.discount?.status || null, summary: node.discount?.summary || null }, source: "admin_api", weight: 1, manual: risky ? { reason: "A text signal cannot establish that a discount is unsafe. Confirm campaign owner, schedule, stackability, and rollback plan before changing it in Shopify admin." } : null }));
      }
      if (!discounts.length) findings.push(finding({ module: "marketing_discounts", id: "discounts-none", severity: "pass", title: "No active discount records were returned for review.", evidence: { count: 0 }, source: "admin_api", weight: 1 }));
    } else findings.push(finding({ module: "marketing_discounts", id: "discounts-unavailable", severity: "info", title: "Discount evidence is unavailable with the current connection.", evidence: { code: read.code }, source: "admin_api", weight: 0 }));
  }
  if (storeUrl) {
    try {
      const url = new URL(storeUrl); const response = await fetchPublic(url.href, { headers: { "User-Agent": "Selofy-StoreSetupAuditor/1.0" } }, { allowedHosts: [url.hostname] }); const meta = extractMeta(await response.response.text());
      const scripts = [...meta.scripts, ...meta.inlineScripts].join(" ").toLowerCase(); const hasGoogle = /googletagmanager|google-analytics|gtag/.test(scripts); const hasMeta = /connect\.facebook\.net|fbevents/.test(scripts); const hasTikTok = /analytics\.tiktok/.test(scripts);
      findings.push(finding({ module: "marketing_discounts", id: "tracking-signals", severity: hasGoogle || hasMeta || hasTikTok ? "pass" : "warning", title: hasGoogle || hasMeta || hasTikTok ? "At least one public tracking implementation signal was detected." : "No common public tracking-script signal was detected.", evidence: { googleSignal: hasGoogle, metaSignal: hasMeta, tiktokSignal: hasTikTok }, source: "public_http", weight: 2, manual: { reason: "Public scripts cannot prove that tracking is authorized, deduplicated, or receiving events. Confirm official Google & YouTube / Facebook & Instagram channel connections manually." } }));
      const gaIds = [...scripts.matchAll(/\bG-[A-Z0-9]{6,}\b/gi)].map((match) => match[0].toUpperCase()); const metaIds = [...scripts.matchAll(/fbq\(\s*["']init["']\s*,\s*["'](\d+)["']/gi)].map((match) => match[1]);
      const duplicated = [...new Set(gaIds.filter((id, index) => gaIds.indexOf(id) !== index)), ...new Set(metaIds.filter((id, index) => metaIds.indexOf(id) !== index))];
      if (duplicated.length) findings.push(finding({ module: "marketing_discounts", id: "tracking-duplicate-signal", severity: "warning", title: "A duplicate public tracking-ID signal was detected.", evidence: { duplicateIds: duplicated }, source: "public_http", weight: 1, manual: { reason: "Confirm whether theme code and official channel apps are both loading the same pixel. Do not remove code until the merchant verifies event ownership and deduplication." } }));
    } catch (error) { findings.push(finding({ module: "marketing_discounts", id: "tracking-unavailable", severity: "info", title: "Public tracking evidence could not be collected.", evidence: { code: String(error?.message || error) }, source: "public_http", weight: 0 })); }
  }
  return findings.length ? completed("marketing_discounts", findings, { source: "mixed" }) : unavailable("marketing_discounts", "NO_EVIDENCE", "No Admin connection or public URL was provided.");
}
