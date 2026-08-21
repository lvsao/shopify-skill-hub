import { shopifyGraphql, ShopifyGraphqlError } from "../core/graphql.mjs";
import { randomUUID } from "node:crypto";

const MUTATIONS = {
  product_update: { query: `mutation ProductUpdate($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id updatedAt } userErrors { field message } } }`, variables: (input) => ({ product: input.product }) },
  product_publish: { query: `mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { publishable { ... on Product { id updatedAt } } userErrors { field message } } }`, variables: (input) => ({ id: input.id, input: input.publications }) },
  variant_bulk_update: { query: `mutation VariantBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id updatedAt } userErrors { field message } } }`, variables: (input) => ({ productId: input.productId, variants: input.variants }) },
  inventory_item_update: { query: `mutation InventoryItemUpdate($id: ID!, $input: InventoryItemInput!) { inventoryItemUpdate(id: $id, input: $input) { inventoryItem { id updatedAt } userErrors { field message } } }`, variables: (input) => ({ id: input.id, input: input.input }) },
  inventory_quantity_set: { query: `mutation InventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) { inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) { inventoryAdjustmentGroup { reason changes { name delta quantityAfterChange } } userErrors { field message } } }`, variables: (input) => ({ input: input.inventory, idempotencyKey: input.idempotencyKey || randomUUID() }) },
  collection_update: { query: `mutation CollectionUpdate($collection: CollectionUpdateInput!) { collectionUpdate(collection: $collection) { collection { id updatedAt } userErrors { field message } } }`, variables: (input) => ({ collection: input.collection }) },
  page_create: { query: `mutation PageCreate($page: PageCreateInput!) { pageCreate(page: $page) { page { id handle updatedAt } userErrors { field message } } }`, variables: (input) => ({ page: input.page }) },
  page_update: { query: `mutation PageUpdate($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id handle updatedAt } userErrors { field message } } }`, variables: (input) => ({ id: input.id, page: input.page }) },
  shop_policy_update: { query: `mutation ShopPolicyUpdate($shopPolicy: ShopPolicyInput!) { shopPolicyUpdate(shopPolicy: $shopPolicy) { shopPolicy { type title body url } userErrors { field message } } }`, variables: (input) => ({ shopPolicy: input.shopPolicy }) },
  menu_update: { query: `mutation MenuUpdate($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { menu { id title handle } userErrors { field message } } }`, variables: (input) => input },
  redirect_create: { query: `mutation UrlRedirectCreate($urlRedirect: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $urlRedirect) { urlRedirect { id path target } userErrors { field message } } }`, variables: (input) => ({ urlRedirect: input.urlRedirect }) },
  redirect_update: { query: `mutation UrlRedirectUpdate($id: ID!, $urlRedirect: UrlRedirectInput!) { urlRedirectUpdate(id: $id, urlRedirect: $urlRedirect) { urlRedirect { id path target } userErrors { field message } } }`, variables: (input) => ({ id: input.id, urlRedirect: input.urlRedirect }) },
  redirect_delete: { query: `mutation UrlRedirectDelete($id: ID!) { urlRedirectDelete(id: $id) { deletedUrlRedirectId userErrors { field message } } }`, variables: (input) => ({ id: input.id }) },
  market_update: { query: `mutation MarketUpdate($id: ID!, $input: MarketUpdateInput!) { marketUpdate(id: $id, input: $input) { market { id name } userErrors { field message } } }`, variables: (input) => ({ id: input.id, input: input.market }) },
  delivery_profile_update: { query: `mutation DeliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) { deliveryProfileUpdate(id: $id, profile: $profile) { profile { id name } userErrors { field message } } }`, variables: (input) => ({ id: input.id, profile: input.profile }) },
  market_shipping_update: { query: `mutation MarketShippingUpdate($id: ID!, $input: MarketUpdateInput!) { marketUpdate(id: $id, input: $input) { market { id name } userErrors { field message } } }`, variables: (input) => ({ id: input.id, input: input.market }) },
  checkout_accounts_update: { query: `mutation CheckoutAndAccountsConfigurationUpdate($id: ID!, $configuration: CheckoutAndAccountsConfigurationInput!) { checkoutAndAccountsConfigurationUpdate(id: $id, configuration: $configuration) { configuration { id updatedAt isPublished } userErrors { field message } } }`, variables: (input) => ({ id: input.id, configuration: input.configuration }) },
  theme_files_upsert: { query: `mutation ThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } job { id } userErrors { field message } } }`, variables: (input) => ({ themeId: input.themeId, files: input.files }) },
};

export const ACTION_REQUIRED_SCOPES = Object.freeze({
  product_update: ["write_products"],
  product_publish: ["write_publications"],
  variant_bulk_update: ["write_products"],
  inventory_item_update: ["write_inventory", "read_locations"],
  inventory_quantity_set: ["write_inventory", "read_locations"],
  collection_update: ["write_products"],
  page_create: ["write_content", "write_online_store_pages"],
  page_update: ["write_content", "write_online_store_pages"],
  shop_policy_update: ["write_legal_policies"],
  menu_update: ["write_online_store_navigation"],
  redirect_create: ["write_online_store_navigation"],
  redirect_update: ["write_online_store_navigation"],
  redirect_delete: ["write_online_store_navigation"],
  market_update: ["write_markets"],
  delivery_profile_update: ["write_shipping"],
  market_shipping_update: ["write_markets", "write_shipping"],
  checkout_accounts_update: ["write_checkout_and_accounts_configurations", "write_checkout_settings"],
  theme_files_upsert: ["write_themes"],
});

export function requiredAccessScopes(changes) {
  return [...new Set(changes.flatMap((change) => ACTION_REQUIRED_SCOPES[change.type] || []))].sort();
}

export const CAPABILITY_GATED_ACTIONS = new Set();

function findUserErrors(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload.flatMap(findUserErrors);
  const direct = Array.isArray(payload.userErrors) ? payload.userErrors : [];
  return [...direct, ...Object.values(payload).flatMap((value) => value && typeof value === "object" ? findUserErrors(value) : [])];
}

const JOB_QUERY = `query ThemeWriteJob($id: ID!) { job(id: $id) { id done } }`;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForThemeJob(config, id) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await shopifyGraphql(config, JOB_QUERY, { id });
    if (status.data.job?.done) return { id, done: true, attempts: attempt + 1 };
    await pause(1000);
  }
  throw new ShopifyGraphqlError("THEME_JOB_TIMEOUT", "Theme file job did not complete within 30 seconds; do not assume files were changed.");
}

export async function executeAction(config, change) {
  const definition = MUTATIONS[change.type];
  if (!definition) throw new ShopifyGraphqlError("ACTION_UNSUPPORTED", `No safe executor exists for ${change.type}.`);
  const result = await shopifyGraphql(config, definition.query, definition.variables(change.input), { mutation: true });
  const errors = findUserErrors(result.data);
  if (errors.length) throw new ShopifyGraphqlError("USER_ERRORS", JSON.stringify(errors));
  const job = change.type === "theme_files_upsert" ? result.data.themeFilesUpsert?.job : null;
  return job?.id ? { ...result.data, themeJob: await waitForThemeJob(config, job.id) } : result.data;
}
