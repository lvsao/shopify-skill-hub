import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MODULES } from "./constants.mjs";

const ALLOWED_TYPES = new Set([
  "product_update", "product_publish", "variant_bulk_update", "inventory_item_update", "inventory_quantity_set", "collection_update",
  "page_create", "page_update", "shop_policy_update", "menu_update", "redirect_create", "redirect_update", "redirect_delete",
  "market_update", "delivery_profile_update", "market_shipping_update", "theme_files_upsert", "checkout_accounts_update",
]);
const SENSITIVE_FIELDS = new Set(["sku", "barcode", "price", "compareAtPrice", "quantity", "availableQuantity", "weight", "taxCode", "currencyCode"]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function digest(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

function hasSensitiveField(value) {
  if (Array.isArray(value)) return value.some(hasSensitiveField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => SENSITIVE_FIELDS.has(key) || hasSensitiveField(child));
}

export function validateChange(change, target) {
  if (!change || typeof change !== "object") throw new Error("CANDIDATE_INVALID");
  if (!ALLOWED_TYPES.has(change.type)) throw new Error(`CANDIDATE_ACTION_UNSUPPORTED: ${change.type}`);
  if (!MODULES.includes(change.module) || change.module !== target) throw new Error("CANDIDATE_TARGET_MISMATCH");
  if (!change.id || !change.findingId || !change.input || typeof change.input !== "object") throw new Error("CANDIDATE_MISSING_ID_OR_INPUT");
  if (!change.expected || typeof change.expected !== "object" || !Object.keys(change.expected).length) throw new Error("CANDIDATE_EXPECTED_STATE_REQUIRED");
  if (!new Set(["page_create", "redirect_create", "shop_policy_update"]).has(change.type) && (!change.resource?.id || !change.before || typeof change.before !== "object" || !Object.keys(change.before).length)) throw new Error("CANDIDATE_SNAPSHOT_REQUIRED");
  if (change.type === "page_create" && (!change.before?.handle || change.before.handle !== change.input.page?.handle)) throw new Error("CANDIDATE_PAGE_ABSENCE_SNAPSHOT_REQUIRED");
  if (change.type === "redirect_create" && (!change.before?.path || change.before.path !== change.input.urlRedirect?.path)) throw new Error("CANDIDATE_REDIRECT_ABSENCE_SNAPSHOT_REQUIRED");
  if (change.type === "shop_policy_update" && (!change.resource?.type || !change.before || typeof change.before !== "object")) throw new Error("CANDIDATE_POLICY_SNAPSHOT_REQUIRED");
  if (hasSensitiveField(change.input) && change.merchantProvided !== true) throw new Error("MERCHANT_PROVIDED_VALUES_REQUIRED");
  if (["product_publish", "page_update", "redirect_update", "redirect_delete", "inventory_item_update", "market_update", "market_shipping_update", "delivery_profile_update", "checkout_accounts_update"].includes(change.type) && change.input.id !== change.resource?.id) throw new Error("CANDIDATE_RESOURCE_ID_MISMATCH");
  if (change.type === "product_update" && change.input.product?.id !== change.resource?.id) throw new Error("CANDIDATE_RESOURCE_ID_MISMATCH");
  if (change.type === "variant_bulk_update" && change.input.productId !== change.resource?.id) throw new Error("CANDIDATE_RESOURCE_ID_MISMATCH");
  if (change.type === "collection_update" && change.input.collection?.id !== change.resource?.id) throw new Error("CANDIDATE_RESOURCE_ID_MISMATCH");
  if (change.type === "menu_update" && change.input.id !== change.resource?.id) throw new Error("CANDIDATE_RESOURCE_ID_MISMATCH");
  if (change.type === "page_update" && !change.input.page) throw new Error("CANDIDATE_PAGE_INPUT_REQUIRED");
  if (change.type === "menu_update" && (!change.input.title || !Array.isArray(change.input.items))) throw new Error("CANDIDATE_MENU_INPUT_REQUIRED");
  if (change.type === "theme_files_upsert" && (change.input.themeId !== change.resource?.id || !change.before.files || !Array.isArray(change.input.files) || !change.input.files.length)) throw new Error("CANDIDATE_THEME_FILE_SNAPSHOT_REQUIRED");
  if (change.type === "inventory_quantity_set") {
    const quantity = change.input.inventory?.quantities?.[0];
    if (change.input.inventory?.quantities?.length !== 1 || quantity?.inventoryItemId !== change.resource?.id || !quantity?.locationId || !Number.isInteger(quantity.quantity) || !Number.isInteger(quantity.changeFromQuantity) || change.before.id !== change.resource.id || change.before.locationId !== quantity.locationId || change.before.available !== quantity.changeFromQuantity) throw new Error("CANDIDATE_INVENTORY_COMPARE_AND_SET_REQUIRED");
  }
  const expectedSource = {
    product_update: change.input.product,
    collection_update: change.input.collection,
    page_create: change.input.page,
    page_update: change.input.page,
    shop_policy_update: change.input.shopPolicy,
    inventory_item_update: change.input.input,
    redirect_create: change.input.urlRedirect,
    redirect_update: change.input.urlRedirect,
    menu_update: change.input,
  }[change.type];
  if (expectedSource && !Object.entries(change.expected).some(([key, value]) => key !== "id" && Object.hasOwn(expectedSource, key) && canonicalJson(expectedSource[key]) === canonicalJson(value))) {
    throw new Error("CANDIDATE_EXPECTED_EFFECT_REQUIRED");
  }
  if (change.type === "inventory_quantity_set" && change.expected.available !== change.input.inventory.quantities[0].quantity) throw new Error("CANDIDATE_EXPECTED_EFFECT_REQUIRED");
  if (change.type === "variant_bulk_update") {
    const expectedVariants = change.expected.variants;
    const inputVariants = change.input.variants || [];
    const hasExpectedEffect = Array.isArray(expectedVariants) && expectedVariants.length && expectedVariants.every((expectedVariant) => {
      const proposed = inputVariants.find((variant) => variant.id === expectedVariant?.id);
      return proposed && Object.entries(expectedVariant).some(([key, value]) => key !== "id" && Object.hasOwn(proposed, key) && canonicalJson(proposed[key]) === canonicalJson(value));
    });
    if (!hasExpectedEffect) throw new Error("CANDIDATE_EXPECTED_EFFECT_REQUIRED");
  }
  if (change.type === "product_publish") {
    const publicationIds = new Set((change.input.publications || []).map((item) => item.publicationId));
    if (!Array.isArray(change.expected.publications) || !change.expected.publications.length || !change.expected.publications.every((item) => item?.id && item.published === true && publicationIds.has(item.id))) throw new Error("CANDIDATE_EXPECTED_EFFECT_REQUIRED");
  }
  if (change.type === "redirect_delete" && change.expected.deleted !== true) throw new Error("CANDIDATE_EXPECTED_EFFECT_REQUIRED");
  if (change.type === "menu_update" && (!Array.isArray(change.before.items) || !Array.isArray(change.expected.items))) throw new Error("CANDIDATE_MENU_SNAPSHOT_REQUIRED");
  if (change.moduleApproval !== true) throw new Error("MODULE_APPROVAL_REQUIRED");
  return change;
}

function candidateMatches(manifest, change) {
  return (manifest.candidates || []).some((candidate) => candidate.findingId === change.findingId
    && candidate.module === change.module
    && candidate.action === change.type
    && (!candidate.resourceId || candidate.resourceId === change.resource?.id));
}

export async function loadChangeSet(file, target, manifest) {
  const value = JSON.parse(await readFile(file, "utf8"));
  if (!value || value.auditDigest !== manifest.auditDigest) throw new Error("CANDIDATE_AUDIT_MISMATCH");
  const changes = Array.isArray(value) ? value : value.changes;
  if (!Array.isArray(changes) || !changes.length) throw new Error("CANDIDATE_CHANGES_REQUIRED");
  return changes.map((change) => {
    const validated = validateChange(change, target);
    if (!candidateMatches(manifest, validated)) throw new Error("CANDIDATE_NOT_IN_AUDIT_REPORT");
    return validated;
  });
}

export function changeManifest(changes) {
  const normalized = changes.map((change) => ({ id: change.id, module: change.module, type: change.type, resource: change.resource || null, before: change.before || null, expected: change.expected || change.input }));
  return { version: 1, count: normalized.length, digest: digest(normalized), changes: normalized };
}

export function assertReportManifest(manifest) {
  if (!manifest || manifest.kind !== "shopify-store-setup-audit" || !manifest.auditDigest) throw new Error("REPORT_MANIFEST_INVALID");
  return manifest;
}
