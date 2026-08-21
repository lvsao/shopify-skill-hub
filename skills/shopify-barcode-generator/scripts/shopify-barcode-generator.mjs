#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadShopifyConfig, normalizeMyShopifyDomain, shopifyGraphql } from "./lib/shopify-auth.mjs";

const VERSION = "1.1.0";
export const DISCLAIMER = "Not GS1-licensed. Synthetic GTIN-14 for GMC custom and other tolerant channels etc. only. Not for Amazon or other strict GTIN channels that require GS1-verified codes.";
const PRODUCTS_QUERY = `query BarcodeProducts($cursor: String) { products(first: 250, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id title } } }`;
const VARIANTS_QUERY = `query BarcodeProductVariants($id: ID!, $cursor: String) { product(id: $id) { id title variants(first: 250, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id title sku barcode } } } }`;
const VARIANT_NODES_QUERY = `query BarcodeVariantNodes($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id barcode product { id } } } }`;
const UPDATE_MUTATION = `mutation UpdateVariantBarcodes($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) { productVariants { id barcode } userErrors { field message code } } }`;

function help() {
  console.log(`shopify-barcode-generator ${VERSION}\n\nUsage:\n  generate --count <1-500> [--out <barcodes.csv>] [--format csv|txt]\n  init-env --store <shop>.myshopify.com [--env skill-hub.env] [--method shopify_cli_oauth|dev_dashboard_client_credentials]\n  connection-check --env skill-hub.env\n  scan --env skill-hub.env --out gap-report.html --csv gap-preview.csv [--limit 200]\n  apply --env skill-hub.env --input gap-preview.csv\n  apply --env skill-hub.env --input approved.csv --execute [--out apply-results.csv]\n\n${DISCLAIMER}`);
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      out[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
    } else out._.push(item);
  }
  return out;
}

export function checkDigit14(digits) {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) sum += index % 2 !== 0 ? digits[index] : digits[index] * 3;
  return (10 - (sum % 10)) % 10;
}

export function gtin14Gen() {
  const digits = [0, 0, 3];
  for (let index = 0; index < 10; index += 1) digits.push(Math.floor(Math.random() * 10));
  digits.push(checkDigit14(digits));
  return digits.join("");
}

export function validGTIN14(value) {
  if (!/^\d{14}$/.test(String(value || ""))) return false;
  const digits = [...value].map(Number);
  return checkDigit14(digits.slice(0, -1)) === digits[13];
}

export function generateBatch(count, existing = new Set()) {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("count must be 1-500");
  const results = [];
  const seen = new Set([...existing].map((value) => String(value).trim()).filter(Boolean));
  let collisions = 0;
  while (results.length < count) {
    const barcode = gtin14Gen();
    if (!validGTIN14(barcode) || seen.has(barcode)) {
      collisions += 1;
      if (collisions > count * 10) throw new Error("too many barcode collisions, retry");
      continue;
    }
    seen.add(barcode);
    results.push(barcode);
    collisions = 0;
  }
  return results;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers, rows) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n") + "\n";
}

export function parseCsv(text) {
  const rows = [[]];
  let field = "";
  let quoted = false;
  for (let index = 0; index < String(text || "").length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") { rows.at(-1).push(field); field = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      rows.at(-1).push(field); field = "";
      if (rows.at(-1).some((value) => value !== "")) rows.push([]);
    } else field += character;
  }
  if (quoted) throw new Error("INVALID_CSV: unterminated quoted value.");
  if (field || rows.at(-1).length) rows.at(-1).push(field);
  const [headers = [], ...values] = rows.filter((row) => row.some((value) => value !== ""));
  if (!headers.length) return [];
  return values.map((row) => Object.fromEntries(headers.map((header, index) => [header.trim(), row[index] ?? ""])));
}

function positiveLimit(value, fallback = 200) {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) throw new Error("limit must be 1-500");
  return parsed;
}

async function listProducts(env) {
  const products = [];
  let cursor = null;
  do {
    const data = await shopifyGraphql(env, PRODUCTS_QUERY, { cursor }, { requiredScopes: ["read_products"] });
    products.push(...data.products.nodes);
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  return products;
}

async function listVariants(env, product) {
  const variants = [];
  let cursor = null;
  do {
    const data = await shopifyGraphql(env, VARIANTS_QUERY, { id: product.id, cursor }, { requiredScopes: ["read_products"] });
    if (!data.product) throw new Error(`PRODUCT_NOT_FOUND: ${product.id}`);
    variants.push(...data.product.variants.nodes.map((variant) => ({ ...variant, productId: product.id, productTitle: product.title })));
    cursor = data.product.variants.pageInfo.hasNextPage ? data.product.variants.pageInfo.endCursor : null;
  } while (cursor);
  return variants;
}

async function readStoreVariants(env) {
  const products = await listProducts(env);
  const variants = [];
  for (const product of products) variants.push(...await listVariants(env, product));
  return variants;
}

export function gapRows(variants, limit) {
  const existing = new Set(variants.map((variant) => String(variant.barcode || "").trim()).filter(Boolean));
  const missing = variants.filter((variant) => !String(variant.barcode || "").trim()).slice(0, limit);
  const barcodes = missing.length ? generateBatch(missing.length, existing) : [];
  return missing.map((variant, index) => ({ productId: variant.productId, variantId: variant.id, product: variant.productTitle, variant: variant.title, sku: variant.sku || "", existingBarcode: "", proposedBarcode: barcodes[index], action: "create", approved: "false" }));
}

export function renderGapReport({ store, rows, totalMissing, totalVariants }) {
  const tableRows = rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.product)}</td><td>${escapeHtml(row.variant)}</td><td>${escapeHtml(row.sku)}</td><td><code>${escapeHtml(row.proposedBarcode)}</code></td><td>Review required</td></tr>`).join("") : '<tr><td colspan="5">No missing barcodes in the scanned range.</td></tr>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><title>Shopify barcode gap report</title><style>body{font:15px system-ui,sans-serif;color:#172033;max-width:1100px;margin:32px auto;padding:0 20px}h1{margin-bottom:4px}.muted{color:#5b6474}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.stat{background:#f3f5f8;border-radius:8px;padding:14px;min-width:150px}.notice{background:#fff7dd;border-left:4px solid #c78a00;padding:12px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e1e5eb;vertical-align:top}code{white-space:nowrap}@media print{body{max-width:none;margin:0}}</style></head><body><h1>Shopify barcode gap report</h1><p class="muted">Store: ${escapeHtml(store)} · Generated ${escapeHtml(new Date().toISOString())}</p><div class="stats"><div class="stat"><strong>${totalVariants}</strong><br>variants scanned</div><div class="stat"><strong>${totalMissing}</strong><br>missing barcodes</div><div class="stat"><strong>${rows.length}</strong><br>CSV candidates</div></div><p class="notice">Review the CSV, change only intended rows to <code>approved=true</code>, then run <code>apply --execute</code>. ${escapeHtml(DISCLAIMER)}</p><table><thead><tr><th>Product</th><th>Variant</th><th>SKU</th><th>Proposed GTIN-14</th><th>State</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
}

function requiredColumns(rows, columns) {
  if (!rows.length) throw new Error("INPUT_EMPTY: the CSV has no data rows.");
  const missing = columns.filter((column) => !Object.hasOwn(rows[0], column));
  if (missing.length) throw new Error(`INVALID_CSV: missing columns ${missing.join(", ")}.`);
}

function approvedRows(text) {
  const rows = parseCsv(text);
  requiredColumns(rows, ["productId", "variantId", "existingBarcode", "proposedBarcode", "action", "approved"]);
  const selected = rows.filter((row) => String(row.approved).trim().toLowerCase() === "true");
  if (selected.length > 500) throw new Error("INPUT_LIMIT_EXCEEDED: at most 500 approved rows are allowed.");
  const seen = new Set();
  for (const row of selected) {
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(String(row.productId))) throw new Error(`INVALID_PRODUCT_ID: ${row.productId}`);
    if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(String(row.variantId))) throw new Error(`INVALID_VARIANT_ID: ${row.variantId}`);
    if (!validGTIN14(row.proposedBarcode)) throw new Error(`INVALID_GTIN14: ${row.proposedBarcode}`);
    if (seen.has(row.proposedBarcode)) throw new Error(`DUPLICATE_PROPOSED_BARCODE: ${row.proposedBarcode}`);
    seen.add(row.proposedBarcode);
    if (!["create", "overwrite"].includes(String(row.action).trim())) throw new Error(`INVALID_ACTION: ${row.action}`);
  }
  return selected;
}

async function currentVariants(env, ids) {
  const values = new Map();
  for (let index = 0; index < ids.length; index += 200) {
    const data = await shopifyGraphql(env, VARIANT_NODES_QUERY, { ids: ids.slice(index, index + 200) }, { requiredScopes: ["read_products"] });
    for (const variant of data.nodes.filter(Boolean)) values.set(variant.id, variant);
  }
  return values;
}

function validateSelectedRows(rows, current) {
  const existing = new Set([...current.values()].map((variant) => String(variant.barcode || "").trim()).filter(Boolean));
  for (const row of rows) {
    const variant = current.get(row.variantId);
    if (!variant) throw new Error(`VARIANT_NOT_FOUND: ${row.variantId}`);
    if (variant.product.id !== row.productId) throw new Error(`VARIANT_PRODUCT_MISMATCH: ${row.variantId}`);
    const barcode = String(variant.barcode || "").trim();
    if (row.action === "create" && barcode) throw new Error(`BARCODE_CHANGED_SINCE_PREVIEW: ${row.variantId} now has ${barcode}.`);
    if (row.action === "overwrite" && barcode !== String(row.existingBarcode || "").trim()) throw new Error(`BARCODE_CHANGED_SINCE_PREVIEW: ${row.variantId}.`);
    if (existing.has(row.proposedBarcode) && barcode !== row.proposedBarcode) throw new Error(`PROPOSED_BARCODE_EXISTS: ${row.proposedBarcode}`);
    existing.add(row.proposedBarcode);
  }
}

async function applyRows(env, rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.productId, [...(groups.get(row.productId) || []), row]);
  const outcomes = [];
  for (const [productId, group] of groups) {
    for (let index = 0; index < group.length; index += 250) {
      const batch = group.slice(index, index + 250);
      const data = await shopifyGraphql(env, UPDATE_MUTATION, { productId, variants: batch.map((row) => ({ id: row.variantId, barcode: row.proposedBarcode })) }, { mutation: true, requiredScopes: ["read_products", "write_products"] });
      const result = data.productVariantsBulkUpdate;
      const error = result.userErrors?.map((item) => item.message).join("; ") || "";
      for (const row of batch) outcomes.push({ ...row, writeStatus: error ? "failed" : "written", message: error });
    }
  }
  const reloaded = await currentVariants(env, rows.map((row) => row.variantId));
  return outcomes.map((row) => ({ ...row, verification: reloaded.get(row.variantId)?.barcode === row.proposedBarcode ? "verified" : "failed", message: row.message || (reloaded.get(row.variantId)?.barcode === row.proposedBarcode ? "" : "Barcode did not match after write.") }));
}

function initEnv(args) {
  const envPath = path.resolve(String(args.env || "skill-hub.env"));
  if (fs.existsSync(envPath) && !args.force) throw new Error(`ENV_EXISTS: ${envPath} already exists. Use --force only if you intend to replace it.`);
  const store = normalizeMyShopifyDomain(args.store);
  const method = args.method || "shopify_cli_oauth";
  if (!["shopify_cli_oauth", "dev_dashboard_client_credentials"].includes(method)) throw new Error("INVALID_ACCESS_METHOD: use shopify_cli_oauth or dev_dashboard_client_credentials.");
  const lines = [`SKILL_HUB_SHOPIFY_ACCESS_METHOD=${method}`, `SKILL_HUB_SHOPIFY_STORE_DOMAIN=${store}`];
  if (method === "dev_dashboard_client_credentials") lines.push("SKILL_HUB_SHOPIFY_CLIENT_ID=", "SKILL_HUB_SHOPIFY_CLIENT_SECRET=");
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`Created private configuration: ${envPath}`);
  console.log(method === "shopify_cli_oauth" ? `Next: shopify store auth --store ${store} --scopes read_products,write_products --json` : "Next: add the private Client ID and Client Secret, then run connection-check.");
}

async function connectionCheck(env) {
  const data = await shopifyGraphql(env, "query BarcodeConnectionCheck { shop { name myshopifyDomain } }", {}, { requiredScopes: ["read_products"] });
  console.log(`Connected to ${data.shop.name} (${data.shop.myshopifyDomain}) using ${env.SKILL_HUB_SHOPIFY_ACCESS_METHOD}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help || args.h) return help();
  if (command === "init-env") return initEnv(args);
  if (command === "generate") {
    const count = Number.parseInt(args.count, 10);
    const format = String(args.format || "csv");
    if (!["csv", "txt"].includes(format)) throw new Error("format must be csv or txt");
    const batch = generateBatch(count);
    console.log(`Generated ${batch.length} GTIN-14 barcodes:`);
    batch.forEach((barcode, index) => console.log(`${String(index + 1).padStart(3, " ")}. ${barcode}`));
    console.log(`\n${DISCLAIMER}`);
    if (args.out) {
      const content = format === "txt" ? `${batch.join("\n")}\n` : toCsv(["barcode"], batch.map((barcode) => ({ barcode })));
      fs.writeFileSync(args.out, content, "utf8");
      console.log(`Wrote ${args.out} (${format}).`);
    }
    return;
  }
  const env = await loadShopifyConfig(String(args.env || "skill-hub.env"));
  if (command === "connection-check") return connectionCheck(env);
  if (command === "scan") {
    const limit = positiveLimit(args.limit);
    const variants = await readStoreVariants(env);
    const totalMissing = variants.filter((variant) => !String(variant.barcode || "").trim()).length;
    const rows = gapRows(variants, limit);
    const csvPath = String(args.csv || "gap-preview.csv");
    const reportPath = String(args.out || "gap-report.html");
    const headers = ["productId", "variantId", "product", "variant", "sku", "existingBarcode", "proposedBarcode", "action", "approved"];
    fs.writeFileSync(csvPath, toCsv(headers, rows), "utf8");
    fs.writeFileSync(reportPath, renderGapReport({ store: env.SHOPIFY_STORE_DOMAIN, rows, totalMissing, totalVariants: variants.length }), "utf8");
    console.log(`Scanned ${variants.length} variants; ${totalMissing} have no barcode. Wrote ${rows.length} candidates to ${csvPath} and ${reportPath}.`);
    if (totalMissing > rows.length) console.log(`The preview is capped at ${limit}; rerun with --limit up to 500 for more candidates.`);
    console.log(DISCLAIMER);
    return;
  }
  if (command === "apply") {
    if (!args.input) throw new Error("INPUT_REQUIRED: use --input <approved.csv>.");
    const rows = approvedRows(fs.readFileSync(String(args.input), "utf8"));
    if (!args.execute) {
      console.log(`Preview only: ${rows.length} approved row(s). No Shopify data was changed. Re-run with --execute after reviewing the CSV.`);
      return;
    }
    if (!rows.length) throw new Error("NO_APPROVED_ROWS: set approved=true only for rows you intend to write.");
    const current = await currentVariants(env, rows.map((row) => row.variantId));
    validateSelectedRows(rows, current);
    const results = await applyRows(env, rows);
    if (args.out) fs.writeFileSync(String(args.out), toCsv(["productId", "variantId", "proposedBarcode", "action", "writeStatus", "verification", "message"], results), "utf8");
    const verified = results.filter((row) => row.verification === "verified").length;
    console.log(`Applied ${rows.length} row(s): ${verified} verified, ${rows.length - verified} failed.${args.out ? ` Results: ${args.out}` : ""}`);
    if (verified !== rows.length) process.exitCode = 1;
    return;
  }
  help();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exit(1); });
