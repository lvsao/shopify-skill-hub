import { adminAudit, containsPlaceholder, pass, warn } from "./helpers.mjs";
import { extractMeta, fetchPublic } from "../core/public-fetch.mjs";
import { finding } from "../core/results.mjs";

const QUERY = `query PoliciesAudit { shop { shopPolicies { type title body url } } }`;
const REQUIRED = ["REFUND_POLICY", "PRIVACY_POLICY", "TERMS_OF_SERVICE", "SHIPPING_POLICY"];

export async function audit({ config, storeUrl }) {
  const result = await adminAudit("policies", config, QUERY, {}, (data) => {
    const policies = data.shop?.shopPolicies || []; const byType = new Map(policies.map((policy) => [policy.type, policy]));
    return REQUIRED.flatMap((type) => {
      const policy = byType.get(type);
      if (!policy?.body) return [warn("policies", `missing-${type.toLowerCase()}`, `${type.replaceAll("_", " ")} is missing or empty.`, { type, url: policy?.url || null }, 2, { action: "shop_policy_update", resourceId: type, merchantContentRequired: true })];
      const complete = [pass("policies", `present-${type.toLowerCase()}`, `${type.replaceAll("_", " ")} is present.`, { url: policy.url || null }, 1)];
      if (containsPlaceholder(policy.body)) complete.push(warn("policies", `placeholder-${type.toLowerCase()}`, `${type.replaceAll("_", " ")} appears to include a placeholder.`, { type, url: policy.url || null }, 2, { action: "shop_policy_update", resourceId: type, merchantContentRequired: true }));
      return complete;
    });
  });
  if (result.status !== "complete" || !storeUrl) return result;
  try {
    const origin = new URL(storeUrl); const response = await fetchPublic(origin.href, { headers: { "User-Agent": "Selofy-StoreSetupAuditor/1.0" } }, { allowedHosts: [origin.hostname] });
    const links = extractMeta(await response.response.text()).links.map((href) => new URL(href, origin).pathname.replace(/\/$/, "") || "/");
    for (const policy of result.findings.filter((item) => item.id.startsWith("present-") && item.evidence?.url)) {
      const path = new URL(policy.evidence.url, origin).pathname.replace(/\/$/, "") || "/";
      result.findings.push(finding({ module: "policies", id: `footer-${policy.id}`, severity: links.includes(path) ? "pass" : "warning", title: links.includes(path) ? `${policy.title.replace(" is present.", " is linked from the homepage.")}` : `${policy.title.replace(" is present.", " is not linked from the homepage.")}`, evidence: { policyUrl: policy.evidence.url, homepage: origin.href }, source: "public_http", confidence: "medium", weight: 1, fix: links.includes(path) ? null : { action: "menu_update", merchantValuesRequired: ["footerMenuId", "menuItems"] } }));
    }
  } catch (error) { result.findings.push(finding({ module: "policies", id: "policy-footer-unavailable", severity: "info", title: "Policy footer reachability could not be verified.", evidence: { code: String(error?.message || error) }, source: "public_http", weight: 0 })); }
  return result;
}
