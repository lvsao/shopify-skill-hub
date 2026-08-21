import { completed, finding, unavailable } from "../core/results.mjs";
import { extractMeta, fetchPublic, robotsAllowsRoot } from "../core/public-fetch.mjs";

function issue(id, severity, title, evidence, weight = 1) { return finding({ module: "seo_theme", id, severity, title, evidence, source: "public_http", confidence: "high", weight }); }

export async function audit({ storeUrl }) {
  if (!storeUrl) return unavailable("seo_theme", "PUBLIC_URL_REQUIRED", "A public storefront URL is required for technical SEO evidence.");
  let home; let html; const origin = new URL(storeUrl);
  const started = Date.now();
  try {
    home = await fetchPublic(origin.href, { headers: { "User-Agent": "Selofy-StoreSetupAuditor/1.0" } }, { allowedHosts: [origin.hostname] });
    html = await home.response.text();
  } catch (error) { return unavailable("seo_theme", "PUBLIC_FETCH_FAILED", String(error?.message || error)); }
  const meta = extractMeta(html); const findings = [];
  findings.push(issue("title", meta.title && meta.title.length >= 10 ? "pass" : "warning", meta.title && meta.title.length >= 10 ? "Homepage title is present." : "Homepage title is missing or very short.", { title: meta.title }, 2));
  findings.push(issue("description", meta.description && meta.description.length >= 50 ? "pass" : "warning", meta.description && meta.description.length >= 50 ? "Homepage meta description is present." : "Homepage meta description is missing or sparse.", { length: meta.description?.length || 0 }, 2));
  findings.push(issue("canonical", meta.canonical ? "pass" : "warning", meta.canonical ? "Homepage canonical URL is present." : "Homepage canonical URL is missing.", { canonical: meta.canonical }, 1));
  findings.push(issue("open-graph", meta.ogTitle && meta.ogImage ? "pass" : "warning", meta.ogTitle && meta.ogImage ? "Open Graph title and image are present." : "Open Graph title or image is missing.", { ogTitle: meta.ogTitle, ogImage: meta.ogImage }, 1));
  findings.push(issue("favicon", meta.favicon ? "pass" : "warning", meta.favicon ? "Favicon link is present." : "Favicon link is not present.", { favicon: meta.favicon }, 1));
  findings.push(issue("json-ld", meta.jsonLd.length ? "pass" : "warning", meta.jsonLd.length ? "JSON-LD structured-data blocks are present." : "No JSON-LD structured-data block was detected.", { blocks: meta.jsonLd.length }, 1));
  findings.push(issue("document-language", meta.htmlLang ? "pass" : "warning", meta.htmlLang ? "Homepage document language is declared." : "Homepage document language is not declared.", { lang: meta.htmlLang }, 1));
  const imagesWithoutAlt = meta.imageTags.filter((tag) => !/\balt\s*=/i.test(tag)).length;
  findings.push(issue("image-alt-baseline", !imagesWithoutAlt ? "pass" : "warning", !imagesWithoutAlt ? "Homepage images expose alt attributes." : "Some homepage images have no alt attribute.", { imageCount: meta.imageTags.length, withoutAlt: imagesWithoutAlt }, 1));
  findings.push(issue("response-time", Date.now() - started <= 3000 ? "pass" : "warning", Date.now() - started <= 3000 ? "Homepage responded within the basic 3-second probe budget." : "Homepage exceeded the basic 3-second probe budget.", { responseMs: Date.now() - started }, 1));
  let robots = null; let sitemapStatus = null;
  try { const response = await fetchPublic(new URL("/robots.txt", origin).href, { headers: { "User-Agent": "Selofy-StoreSetupAuditor/1.0" } }, { allowedHosts: [origin.hostname] }); robots = await response.response.text(); findings.push(issue("robots", response.response.ok && robotsAllowsRoot(robots) ? "pass" : "warning", response.response.ok && robotsAllowsRoot(robots) ? "robots.txt permits root crawling for the auditor user agent." : "robots.txt may block root crawling.", { status: response.response.status }, 1)); } catch (error) { findings.push(issue("robots", "warning", "robots.txt could not be verified.", { code: String(error?.message || error) }, 1)); }
  try { const response = await fetchPublic(new URL("/sitemap.xml", origin).href, { headers: { "User-Agent": "Selofy-StoreSetupAuditor/1.0" } }, { allowedHosts: [origin.hostname] }); sitemapStatus = response.response.status; findings.push(issue("sitemap", response.response.ok ? "pass" : "warning", response.response.ok ? "sitemap.xml is reachable." : "sitemap.xml is not reachable.", { status: response.response.status }, 1)); } catch (error) { findings.push(issue("sitemap", "warning", "sitemap.xml could not be verified.", { code: String(error?.message || error) }, 1)); }
  return completed("seo_theme", findings, { source: "public_http", finalUrl: home.finalUrl, robotsChecked: robots !== null, sitemapStatus });
}
