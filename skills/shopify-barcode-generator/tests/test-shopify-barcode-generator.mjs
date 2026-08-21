import assert from "node:assert/strict";
import test from "node:test";
import { checkDigit14, gapRows, generateBatch, parseCsv, renderGapReport, toCsv, validGTIN14 } from "../scripts/shopify-barcode-generator.mjs";

test("GTIN-14 generator creates distinct checksum-valid values", () => {
  const batch = generateBatch(500);
  assert.equal(batch.length, 500);
  assert.equal(new Set(batch).size, 500);
  assert.ok(batch.every(validGTIN14));
  assert.equal(checkDigit14([..."0031234567890"].map(Number)), Number("00312345678906".at(-1)));
});

test("CSV output is directly parseable and starts with a real header", () => {
  const text = toCsv(["barcode", "label"], [{ barcode: "00312345678906", label: "Size, \"large\"" }]);
  assert.match(text, /^barcode,label\n/);
  assert.ok(!text.startsWith("#"));
  assert.deepEqual(parseCsv(text), [{ barcode: "00312345678906", label: "Size, \"large\"" }]);
});

test("scan candidates exclude existing store barcodes and require approval", () => {
  const rows = gapRows([
    { productId: "gid://shopify/Product/1", id: "gid://shopify/ProductVariant/1", productTitle: "One", title: "Default", sku: "ONE", barcode: "00312345678906" },
    { productId: "gid://shopify/Product/2", id: "gid://shopify/ProductVariant/2", productTitle: "Two", title: "Blue", sku: "TWO", barcode: "" },
  ], 200);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "create");
  assert.equal(rows[0].approved, "false");
  assert.notEqual(rows[0].proposedBarcode, "00312345678906");
});

test("a store with no barcode gaps produces an empty candidate list", () => {
  const rows = gapRows([{ productId: "gid://shopify/Product/1", id: "gid://shopify/ProductVariant/1", productTitle: "One", title: "Default", sku: "ONE", barcode: "00312345678906" }], 200);
  assert.deepEqual(rows, []);
});

test("gap report escapes untrusted product data and uses a restrictive CSP", () => {
  const html = renderGapReport({ store: "bad</title><script>alert(1)</script>", totalMissing: 1, totalVariants: 1, rows: [{ product: "<img src=x>", variant: "x", sku: "y", proposedBarcode: "00312345678906" }] });
  assert.match(html, /Content-Security-Policy/);
  assert.ok(html.includes("&lt;img src=x&gt;"));
  assert.ok(!html.includes("<script>alert(1)</script>"));
});
