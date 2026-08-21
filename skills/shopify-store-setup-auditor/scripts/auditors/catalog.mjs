import { completed, finding, unavailable } from "../core/results.mjs";
import { safeShopifyRead } from "../core/graphql.mjs";
import { containsPlaceholder, textLength } from "./helpers.mjs";

const QUERY = `query CatalogAudit($after: String) { products(first: 50, after: $after) { nodes { id title status descriptionHtml seo { title description } category { id fullName } collections(first: 1) { nodes { id } } media(first: 100) { nodes { ... on MediaImage { id alt } } } variants(first: 100) { nodes { id sku barcode price compareAtPrice inventoryPolicy inventoryQuantity inventoryItem { id requiresShipping tracked measurement { weight { value unit } } } } } } pageInfo { hasNextPage endCursor } } }`;
const PUBLICATIONS_QUERY = `query PublicationsAudit { publications(first: 100) { nodes { id catalog { title } } } }`;
const UNPUBLISHED_QUERY = `query ProductsUnpublishedAudit($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id unpublishedPublications(first: 100) { nodes { id } } } } }`;
const MAX_PAGES = 10;

function item(module, severity, id, title, evidence, weight = 1, fix = null, manual = null) {
  return finding({ module, severity, id, title, evidence, source: "admin_api", confidence: "high", weight, fix, manual });
}

export async function audit({ config }) {
  if (!config) return unavailable("catalog", "CONNECTION_NOT_CONFIGURED", "No authorized Shopify Admin connection was supplied.");
  const products = []; let after = null; let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const read = await safeShopifyRead(config, QUERY, { after });
    if (!read.available) return unavailable("catalog", read.code, read.error);
    const connection = read.data.products || {}; products.push(...(connection.nodes || []));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  const findings = [];
  if (!products.length) findings.push(item("catalog", "warning", "catalog-empty", "No products were returned for catalog review.", { count: 0 }, 2));
  for (const product of products) {
    const evidence = { productId: product.id, title: product.title };
    findings.push(item("catalog", product.status === "ACTIVE" ? "pass" : "warning", `status-${product.id}`, `${product.title}: product status is ${product.status}.`, { ...evidence, status: product.status }, 1, { action: "product_update", resourceId: product.id, fields: ["status"] }));
    if (!product.variants?.nodes?.length) findings.push(item("catalog", "critical", `variants-${product.id}`, `${product.title}: no purchasable variant was returned.`, evidence, 3));
    const length = textLength(product.descriptionHtml);
    findings.push(item("catalog", length >= 100 && !containsPlaceholder(product.descriptionHtml) ? "pass" : "warning", `description-${product.id}`, `${product.title}: product description ${length >= 100 && !containsPlaceholder(product.descriptionHtml) ? "is present" : "is sparse, missing, or contains a placeholder"}.`, { ...evidence, textLength: length }, 1, { action: "product_update", resourceId: product.id, fields: ["descriptionHtml"], merchantContentRequired: true }));
    findings.push(item("catalog", product.seo?.title && product.seo?.description ? "pass" : "warning", `seo-${product.id}`, `${product.title}: product SEO title or description is missing.`, { ...evidence, seo: product.seo || null }, 1, { action: "product_update", resourceId: product.id, fields: ["seo"], merchantContentRequired: true }));
    findings.push(item("catalog", product.collections?.nodes?.length ? "pass" : "warning", `collection-${product.id}`, `${product.title}: ${product.collections?.nodes?.length ? "has" : "does not have"} a collection assignment.`, evidence, 1, null, product.collections?.nodes?.length ? null : { reason: "Choose the collection source and product selection in Shopify admin. The 2026-07 collections model requires a source ID; this auditor does not guess one." }));
    findings.push(item("catalog", product.category ? "pass" : "warning", `category-${product.id}`, `${product.title}: Shopify taxonomy category ${product.category ? "is set" : "is missing"}.`, { ...evidence, category: product.category?.fullName || null }, 1, { action: "product_update", resourceId: product.id, fields: ["category"], merchantValuesRequired: ["categoryId"] }));
    const images = product.media?.nodes || [];
    if (images.length) findings.push(item("catalog", images.every((image) => String(image.alt || "").trim()) ? "pass" : "warning", `image-alt-${product.id}`, `${product.title}: image alt text ${images.every((image) => String(image.alt || "").trim()) ? "is complete" : "is incomplete"}.`, { ...evidence, imageCount: images.length }, 1, null));
    for (const variant of product.variants?.nodes || []) {
      const v = { ...evidence, variantId: variant.id };
      findings.push(item("catalog", variant.sku ? "pass" : "warning", `sku-${variant.id}`, `${product.title}: variant SKU ${variant.sku ? "is present" : "is missing"}.`, v, 1, variant.sku ? null : { action: "variant_bulk_update", resourceId: product.id, merchantValuesRequired: ["skuTemplate"] }));
      if (!variant.barcode) findings.push(item("catalog", "warning", `barcode-${variant.id}`, `${product.title}: variant barcode is missing.`, v, 1, null));
      if (variant.compareAtPrice && Number(variant.compareAtPrice) <= Number(variant.price)) findings.push(item("catalog", "warning", `compare-price-${variant.id}`, `${product.title}: compare-at price is not higher than price.`, { ...v, price: variant.price, compareAtPrice: variant.compareAtPrice }, 2, { action: "variant_bulk_update", resourceId: product.id, merchantValuesRequired: ["priceDecision"] }));
      if (variant.inventoryItem?.requiresShipping && (!variant.inventoryItem.measurement?.weight || Number(variant.inventoryItem.measurement.weight.value) <= 0)) findings.push(item("catalog", "warning", `weight-${variant.id}`, `${product.title}: shippable variant has no positive weight.`, v, 1, { action: "inventory_item_update", resourceId: variant.inventoryItem.id, merchantValuesRequired: ["weight"] }));
      if (variant.inventoryQuantity <= 0 && variant.inventoryPolicy !== "CONTINUE") findings.push(item("catalog", "warning", `stock-${variant.id}`, `${product.title}: variant is out of stock and cannot continue selling.`, { ...v, inventoryQuantity: variant.inventoryQuantity, inventoryPolicy: variant.inventoryPolicy }, 1, { action: "variant_bulk_update", resourceId: product.id, merchantValuesRequired: ["inventoryPolicyDecision"] }));
    }
  }
  const publicationRead = await safeShopifyRead(config, PUBLICATIONS_QUERY);
  const onlineStore = publicationRead.available ? (publicationRead.data.publications?.nodes || []).find((publication) => /^online store$/i.test(publication.catalog?.title || "")) : null;
  if (!onlineStore) findings.push(item("catalog", "info", "online-store-publication-unavailable", "Online Store publication evidence is unavailable.", { code: publicationRead.available ? "ONLINE_STORE_PUBLICATION_NOT_IDENTIFIED" : publicationRead.code }, 0));
  else {
    for (let offset = 0; offset < products.length; offset += 50) {
      const sample = products.slice(offset, offset + 50); const read = await safeShopifyRead(config, UNPUBLISHED_QUERY, { ids: sample.map((product) => product.id) });
      if (!read.available) { findings.push(item("catalog", "info", "online-store-publication-unavailable", "Online Store product-publication evidence is unavailable.", { code: read.code }, 0)); break; }
      const unpublished = new Map((read.data.nodes || []).map((node) => [node.id, new Set((node.unpublishedPublications?.nodes || []).map((publication) => publication.id))]));
      for (const product of sample.filter((candidate) => candidate.status === "ACTIVE")) {
        const isPublished = !unpublished.get(product.id)?.has(onlineStore.id);
        findings.push(item("catalog", isPublished ? "pass" : "warning", `${product.id}-online-store-publication`, `${product.title}: ${isPublished ? "is" : "is not"} published to Online Store.`, { productId: product.id, publicationId: onlineStore.id, publicationName: onlineStore.catalog?.title || null }, 1, isPublished ? null : { action: "product_publish", resourceId: product.id, merchantValuesRequired: ["publicationId"] }));
      }
    }
  }
  if (truncated) findings.push(item("catalog", "warning", "catalog-truncated", "Catalog evidence is capped at 500 products for this run.", { inspected: products.length }, 0));
  return completed("catalog", findings, { source: "admin_api", inspectedProducts: products.length, truncated });
}
