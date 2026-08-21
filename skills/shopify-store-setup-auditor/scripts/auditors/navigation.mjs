import { completed, finding, unavailable } from "../core/results.mjs";
import { safeShopifyRead } from "../core/graphql.mjs";
import { fetchPublic } from "../core/public-fetch.mjs";

const MENU_QUERY = `query NavigationAudit { menus(first: 20) { nodes { id title handle items { id title type url resourceId items { id title type url resourceId items { id title type url resourceId } } } } } }`;
const COLLECTION_QUERY = `query CollectionsNavigationAudit { collections(first: 250) { nodes { id title handle descriptionHtml seo { title description } products(first: 1) { nodes { id } } } } }`;
function flatten(items = [], menuId) { return items.flatMap((item) => [{ ...item, menuId }, ...flatten(item.items || [], menuId)]); }

export async function audit({ config, storeUrl }) {
  if (!config) return unavailable("navigation", "CONNECTION_NOT_CONFIGURED", "Menu resource-link evidence requires an authorized Shopify Admin connection.");
  const read = await safeShopifyRead(config, MENU_QUERY);
  if (!read.available) return unavailable("navigation", read.code, read.error);
  const menus = read.data.menus?.nodes || []; const entries = menus.flatMap((menu) => flatten(menu.items || [], menu.id));
  const findings = [finding({ module: "navigation", id: "menus-present", severity: menus.length ? "pass" : "warning", title: menus.length ? "Navigation menus are present." : "No navigation menus were returned.", evidence: { menuCount: menus.length, itemCount: entries.length }, source: "admin_api", weight: 2 })];
  for (const entry of entries.filter((item) => String(item.url || "").trim() === "#")) findings.push(finding({ module: "navigation", id: `placeholder-${entry.id}`, severity: "warning", title: `Menu item “${entry.title}” uses a placeholder link.`, evidence: { menuId: entry.menuId, menuItemId: entry.id, url: entry.url }, source: "admin_api", weight: 2, fix: { action: "menu_update", resourceId: entry.menuId, merchantValuesRequired: ["menuItems"] } }));
  const required = ["contact", "about", "shop", "catalog"];
  const haystack = entries.map((entry) => `${entry.title} ${entry.url}`.toLowerCase()).join(" ");
  for (const name of required) findings.push(finding({ module: "navigation", id: `entry-${name}`, severity: haystack.includes(name) ? "pass" : "warning", title: haystack.includes(name) ? `Navigation includes a ${name} entry.` : `Navigation has no obvious ${name} entry.`, evidence: { name }, source: "admin_api", weight: 1, manual: haystack.includes(name) ? null : { reason: "Choose the intended menu before adding this entry. The audit cannot safely infer which navigation menu should change." } }));
  const collections = await safeShopifyRead(config, COLLECTION_QUERY);
  if (!collections.available) findings.push(finding({ module: "navigation", id: "collections-unavailable", severity: "info", title: "Collection structure evidence is unavailable.", evidence: { code: collections.code }, source: "admin_api", weight: 0 }));
  else for (const collection of collections.data.collections?.nodes || []) {
    const linked = entries.some((entry) => entry.resourceId === collection.id);
    const hasProduct = Boolean(collection.products?.nodes?.length);
    if (linked && !hasProduct) findings.push(finding({ module: "navigation", id: `empty-collection-${collection.id}`, severity: "warning", title: `Linked collection “${collection.title}” is empty.`, evidence: { collectionId: collection.id, handle: collection.handle }, source: "admin_api", weight: 2, manual: { reason: "Choose a valid collection source and manual selections in Shopify admin. The current API requires the source ID, which this audit cannot infer safely." } }));
    findings.push(finding({ module: "navigation", id: `collection-seo-${collection.id}`, severity: collection.seo?.title && collection.seo?.description && collection.descriptionHtml ? "pass" : "warning", title: `Collection “${collection.title}” ${collection.seo?.title && collection.seo?.description && collection.descriptionHtml ? "has" : "needs"} description and SEO content.`, evidence: { collectionId: collection.id, hasDescription: Boolean(collection.descriptionHtml), seo: collection.seo || null }, source: "admin_api", weight: 1, fix: collection.seo?.title && collection.seo?.description && collection.descriptionHtml ? null : { action: "collection_update", resourceId: collection.id, merchantContentRequired: true } }));
  }
  const origin = new URL(storeUrl); const external = entries.filter((entry) => entry.url && !entry.url.startsWith("#") && !/^mailto:|^tel:/i.test(entry.url)).slice(0, 80);
  for (const entry of external) {
    try {
      const target = new URL(entry.url, origin); if (target.hostname !== origin.hostname) continue;
      let response = await fetchPublic(target.href, { method: "HEAD", headers: { "User-Agent": "Selofy-StoreSetupAuditor/1.0" } }, { allowedHosts: [origin.hostname] });
      if ([405, 501].includes(response.response.status)) response = await fetchPublic(target.href, { method: "GET", headers: { "User-Agent": "Selofy-StoreSetupAuditor/1.0", Range: "bytes=0-0" } }, { allowedHosts: [origin.hostname] });
      if (response.response.status >= 400) findings.push(finding({ module: "navigation", id: `broken-${entry.id}`, severity: "warning", title: `Menu item “${entry.title}” returns HTTP ${response.response.status}.`, evidence: { menuId: entry.menuId, menuItemId: entry.id, url: target.href, status: response.response.status }, source: "public_http", weight: 2, fix: { action: "menu_update", resourceId: entry.menuId, merchantValuesRequired: ["menuItems"] } }));
    } catch (error) {
      const code = String(error?.message || error);
      const loop = /REDIRECT_LIMIT/.test(code);
      findings.push(finding({ module: "navigation", id: `unverified-${entry.id}`, severity: loop ? "warning" : "info", title: loop ? `Menu item “${entry.title}” appears to be in a redirect loop.` : `Menu item “${entry.title}” could not be publicly verified.`, evidence: { menuId: entry.menuId, code }, source: "public_http", weight: loop ? 2 : 0, fix: loop ? { action: "menu_update", resourceId: entry.menuId, merchantValuesRequired: ["menuItems"] } : null }));
    }
  }
  return completed("navigation", findings, { source: "mixed", inspectedLinks: external.length });
}
