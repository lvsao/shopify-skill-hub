import { fetchPublic } from "../core/public-fetch.mjs";
import { completed, finding, unavailable } from "../core/results.mjs";
import { safeShopifyRead } from "../core/graphql.mjs";
import dns from "node:dns/promises";

const QUERY = `query DomainAudit { shop { myshopifyDomain email contactEmail primaryDomain { host sslEnabled url } } }`;
const PERSONAL_EMAIL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "qq.com", "163.com"]);

export async function audit({ config, storeUrl }) {
  if (!config && !storeUrl) return unavailable("domain", "NO_DOMAIN_EVIDENCE", "No public URL or authorized Admin connection was available.");
  const findings = [];
  if (config) {
    const read = await safeShopifyRead(config, QUERY);
    if (read.available) {
      const shop = read.data.shop || {}; const primary = shop.primaryDomain || {};
      findings.push(finding({ module: "domain", id: "primary-domain", severity: primary.host && primary.host !== shop.myshopifyDomain ? "pass" : "warning", title: primary.host && primary.host !== shop.myshopifyDomain ? "A custom primary domain is configured." : "The primary domain is still the myshopify.com address.", evidence: { primary: primary.host || null, myshopify: shop.myshopifyDomain || null }, source: "admin_api", weight: 2 }));
      findings.push(finding({ module: "domain", id: "ssl", severity: primary.sslEnabled ? "pass" : "critical", title: primary.sslEnabled ? "Primary-domain SSL is enabled." : "Primary-domain SSL is not enabled.", evidence: { host: primary.host || null, sslEnabled: Boolean(primary.sslEnabled) }, source: "admin_api", weight: 3, manual: primary.sslEnabled ? null : { reason: "Domain verification and DNS ownership must be completed in Shopify Admin/DNS provider." } }));
      const sender = shop.contactEmail || shop.email || "";
      const senderDomain = sender.split("@").pop()?.toLowerCase();
      if (senderDomain && PERSONAL_EMAIL_DOMAINS.has(senderDomain)) {
        findings.push(finding({ module: "domain", id: "sender-domain", severity: "warning", title: "The store sender email uses a consumer mailbox domain.", evidence: { domain: senderDomain }, source: "admin_api", weight: 1, manual: { reason: "Use and authenticate a domain-controlled sender email to improve deliverability." } }));
      } else if (senderDomain) {
        const [spf, dmarc] = await Promise.all([dns.resolveTxt(senderDomain).catch(() => []), dns.resolveTxt(`_dmarc.${senderDomain}`).catch(() => [])]);
        const hasSpf = spf.flat().some((value) => /^v=spf1/i.test(value));
        const hasDmarc = dmarc.flat().some((value) => /^v=dmarc1/i.test(value));
        findings.push(finding({ module: "domain", id: "sender-dns", severity: hasSpf ? "pass" : "warning", title: hasSpf ? "Sender domain has an SPF TXT signal." : "Sender domain has no detectable SPF TXT signal.", evidence: { domain: senderDomain, spf: hasSpf, dmarc: hasDmarc }, source: "dns", weight: 1, manual: hasSpf ? { reason: "DKIM needs a provider-specific selector; confirm it in Shopify and at the DNS provider." } : { reason: "Ask the email provider for its SPF/DKIM records and publish them with the DNS provider; verify DMARC policy separately." } }));
      }
    } else findings.push(finding({ module: "domain", id: "admin-domain-evidence", severity: "info", title: "Admin domain evidence is unavailable.", evidence: { code: read.code }, source: "admin_api", weight: 0 }));
  }
  try {
    const start = new URL(storeUrl); const checked = await fetchPublic(start.href, { method: "GET", headers: { "User-Agent": "Selofy-StoreSetupAuditor/1.0" } }, { allowedHosts: [start.hostname] });
    const final = new URL(checked.finalUrl);
    findings.push(finding({ module: "domain", id: "https-public", severity: final.protocol === "https:" && checked.response.ok ? "pass" : "critical", title: final.protocol === "https:" && checked.response.ok ? "Public storefront is reachable through HTTPS." : "Public storefront HTTPS request did not succeed.", evidence: { status: checked.response.status, finalUrl: checked.finalUrl, redirects: checked.redirects }, source: "public_http", weight: 3 }));
  } catch (error) { findings.push(finding({ module: "domain", id: "https-public", severity: "warning", title: "Public storefront reachability could not be verified.", evidence: { code: String(error?.message || error) }, source: "public_http", weight: 1 })); }
  return findings.length ? completed("domain", findings, { source: "mixed" }) : unavailable("domain", "NO_DOMAIN_EVIDENCE", "No public URL or authorized Admin connection was available.");
}
