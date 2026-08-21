import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auditors = [
  "foundation", "domain", "policies", "checkout", "markets-shipping", "catalog", "navigation", "seo-theme", "marketing-discounts", "content-trust",
];

test("every independent auditor imports and provides an unavailable state without a connection", async () => {
  for (const name of auditors) {
    const module = await import(`../scripts/auditors/${name}.mjs`);
    assert.equal(typeof module.audit, "function", name);
    const result = await module.audit({ config: null, storeUrl: null });
    assert.equal(result.status, "unavailable", name);
  }
});

test("Market-driven shipping query selects the Count scalar subfield", async () => {
  const source = await readFile(new URL("../scripts/auditors/markets-shipping.mjs", import.meta.url), "utf8");
  assert.match(source, /optionDefinitionsCount\s*\{\s*count\s*\}/);
  assert.match(source, /activeOptionDefinitionsCount:\s*optionDefinitionsCount\(active: true\)\s*\{\s*count\s*\}/);
});

test("menu repair hints bind to the parent menu, not a menu-item ID", async () => {
  const source = await readFile(new URL("../scripts/auditors/navigation.mjs", import.meta.url), "utf8");
  assert.match(source, /flatten\(menu\.items \|\| \[\], menu\.id\)/);
  assert.match(source, /resourceId: entry\.menuId/);
  assert.doesNotMatch(source, /resourceId: entry\.id/);
});
