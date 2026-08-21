import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_GATED_ACTIONS, executeAction, requiredAccessScopes } from "../scripts/fixers/actions.mjs";
import { previewChanges } from "../scripts/fixers/index.mjs";

test("current Market-shipping and checkout actions use concrete schema-backed executors", () => {
  assert.equal(CAPABILITY_GATED_ACTIONS.has("market_shipping_update"), false);
  assert.equal(CAPABILITY_GATED_ACTIONS.has("checkout_accounts_update"), false);
});

test("each approved candidate reports only the access scopes its actions need", () => {
  assert.deepEqual(requiredAccessScopes([{ type: "product_update" }, { type: "page_update" }, { type: "product_update" }]), ["write_content", "write_online_store_pages", "write_products"]);
  assert.deepEqual(requiredAccessScopes([{ type: "inventory_quantity_set" }]), ["read_locations", "write_inventory"]);
});

test("fix preview does not execute a mutation", async () => {
  const change = { id: "x", module: "catalog", findingId: "product-title-1", type: "product_update", resource: { id: "gid://shopify/Product/1" }, before: { id: "gid://shopify/Product/1" }, input: { product: { id: "gid://shopify/Product/1" } }, expected: { title: "Approved" }, moduleApproval: true };
  const result = await previewChanges(null, [change]);
  assert.equal(result[0].ok, false);
  await assert.rejects(() => executeAction({}, { ...change, type: "market_shipping_update" }), /CONNECTION_INCOMPLETE/);
});
