import { safeShopifyRead } from "../core/graphql.mjs";
import { canonicalJson } from "../core/changes.mjs";

const NODE_PROBE = `query ChangeSnapshot($id: ID!) { node(id: $id) { id ... on Product { updatedAt title descriptionHtml status seo { title description } category { id } collections(first: 250) { nodes { id } } variants(first: 250) { nodes { id sku barcode price compareAtPrice inventoryPolicy } } } ... on ProductVariant { updatedAt sku barcode price compareAtPrice inventoryPolicy } ... on Collection { updatedAt title descriptionHtml seo { title description } products(first: 250) { nodes { id } } } ... on Page { updatedAt title handle body isPublished } ... on InventoryItem { updatedAt measurement { weight { value unit } } } ... on OnlineStoreTheme { updatedAt } ... on Market { id name handle marketStatus: status } ... on DeliveryProfile { id name } ... on Menu { id title handle items { id title type url resourceId items { id title type url resourceId items { id title type url resourceId } } } } ... on UrlRedirect { id path target } ... on CheckoutAndAccountsConfiguration { id updatedAt isPublished } } }`;
const POLICY_PROBE = `query PolicySnapshot { shop { shopPolicies { type title body url } } }`;
const PRODUCT_PUBLICATION_PROBE = `query ProductPublicationSnapshot($id: ID!) { node(id: $id) { ... on Product { id unpublishedPublications(first: 250) { nodes { id } } } } }`;
const THEME_FILES_PROBE = `query ThemeFileSnapshot($id: ID!) { theme(id: $id) { id role files(first: 250) { nodes { filename checksumMd5 updatedAt } userErrors { code filename } } } }`;
const PAGE_HANDLE_PROBE = `query PageHandleSnapshot($query: String!) { pages(first: 10, query: $query) { nodes { id handle title body isPublished } } }`;
const REDIRECT_PATH_PROBE = `query RedirectPathSnapshot($query: String!) { urlRedirects(first: 10, query: $query) { nodes { id path target } } }`;
const INVENTORY_LEVEL_PROBE = `query InventoryLevelSnapshot($id: ID!) { inventoryItem(id: $id) { id inventoryLevels(first: 250) { nodes { quantities(names: ["available"]) { name quantity } location { id } } } } }`;

export async function checkSnapshot(config, change) {
  if (change.type === "page_create") {
    const read = await safeShopifyRead(config, PAGE_HANDLE_PROBE, { query: `handle:${change.before.handle}` });
    if (!read.available) return { ok: false, code: read.code, detail: read.error };
    const existing = (read.data.pages?.nodes || []).find((page) => page.handle === change.before.handle);
    return existing ? { ok: false, code: "STALE_SNAPSHOT", current: existing, expected: { absentHandle: change.before.handle } } : { ok: true, current: null, reason: "absence-confirmed" };
  }
  if (change.type === "redirect_create") {
    const read = await safeShopifyRead(config, REDIRECT_PATH_PROBE, { query: `path:${change.before.path}` });
    if (!read.available) return { ok: false, code: read.code, detail: read.error };
    const existing = (read.data.urlRedirects?.nodes || []).find((redirect) => redirect.path === change.before.path);
    return existing ? { ok: false, code: "STALE_SNAPSHOT", current: existing, expected: { absentPath: change.before.path } } : { ok: true, current: null, reason: "absence-confirmed" };
  }
  let current;
  if (change.type === "product_publish") {
    const read = await safeShopifyRead(config, PRODUCT_PUBLICATION_PROBE, { id: change.resource.id });
    if (!read.available) return { ok: false, code: read.code, detail: read.error };
    const product = read.data.node;
    if (!product) return { ok: false, code: "RESOURCE_NOT_FOUND" };
    const unpublished = new Set((product.unpublishedPublications?.nodes || []).map((publication) => publication.id));
    const publicationIds = (change.input.publications || []).map((publication) => publication.publicationId).filter(Boolean);
    current = { id: product.id, publications: publicationIds.map((id) => ({ id, published: !unpublished.has(id) })) };
  } else if (change.type === "inventory_quantity_set") {
    const read = await safeShopifyRead(config, INVENTORY_LEVEL_PROBE, { id: change.resource.id });
    if (!read.available) return { ok: false, code: read.code, detail: read.error };
    const quantity = change.input.inventory.quantities[0];
    const level = (read.data.inventoryItem?.inventoryLevels?.nodes || []).find((candidate) => candidate.location?.id === quantity.locationId);
    current = level ? { id: change.resource.id, locationId: quantity.locationId, available: level.quantities?.find((entry) => entry.name === "available")?.quantity ?? null } : null;
  } else if (change.type === "theme_files_upsert") {
    const read = await safeShopifyRead(config, THEME_FILES_PROBE, { id: change.resource.id });
    if (!read.available) return { ok: false, code: read.code, detail: read.error };
    const theme = read.data.theme;
    if (!theme) return { ok: false, code: "RESOURCE_NOT_FOUND" };
    const requested = new Set((change.input.files || []).map((file) => file.filename));
    current = { id: theme.id, role: theme.role, files: Object.fromEntries((theme.files?.nodes || []).filter((file) => requested.has(file.filename)).map((file) => [file.filename, file.checksumMd5])) };
    if (requested.size !== Object.keys(current.files).length) return { ok: false, code: "THEME_FILE_NOT_FOUND", current };
  } else if (change.type === "shop_policy_update") {
    const read = await safeShopifyRead(config, POLICY_PROBE);
    if (!read.available) return { ok: false, code: read.code, detail: read.error };
    const type = change.input.shopPolicy?.type || change.resource?.type;
    current = (read.data.shop?.shopPolicies || []).find((policy) => policy.type === type) || null;
  } else {
    const read = await safeShopifyRead(config, NODE_PROBE, { id: change.resource.id });
    if (!read.available) return { ok: false, code: read.code, detail: read.error };
    current = read.data.node || null;
  }
  if (!current) return { ok: false, code: "RESOURCE_NOT_FOUND" };
  const expected = change.before;
  const matches = Object.entries(expected).every(([key, value]) => canonicalJson(current[key]) === canonicalJson(value));
  return matches ? { ok: true, current } : { ok: false, code: "STALE_SNAPSHOT", current, expected };
}
