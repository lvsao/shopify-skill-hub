#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const DEFAULT_ENV = "skill-hub.env";
const DEFAULT_VERSION_CANDIDATES = ["2026-04", "2026-01", "2025-10", "2025-07"];
const REQUIRED_SCOPES = "read_products,write_products,read_files,write_files";
const DEFAULT_BATCH_SIZE = 5;
const MAX_SCAN_PRODUCTS = 250;
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, "..");
const REPORT_TEMPLATE = path.join(SKILL_ROOT, "assets", "report-template.html");

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
  }
  return env;
}

async function loadEnv(file) {
  const text = await fs.readFile(file, "utf8").catch(() => null);
  if (!text) fail(`Missing env file: ${file}. Run init-env first.`);
  return parseEnv(text);
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

async function ensureGitignoreLine(line) {
  const gitignore = ".gitignore";
  const existing = await fs.readFile(gitignore, "utf8").catch(() => null);
  if (existing === null || existing.split(/\r?\n/).includes(line)) return false;
  const next = existing.endsWith("\n") ? `${existing}${line}\n` : `${existing}\n${line}\n`;
  await fs.writeFile(gitignore, next, "utf8");
  return true;
}

async function initEnv(args) {
  const method = args.method || "admin_custom_app";
  const envFile = args.env || DEFAULT_ENV;
  if (!["admin_custom_app", "dev_dashboard_app"].includes(method)) {
    fail("--method must be admin_custom_app or dev_dashboard_app");
  }
  const template =
    method === "admin_custom_app"
      ? `# Skill Hub shared Shopify configuration\n# Keep this file private. Do not commit it or paste tokens into chat.\n\nSKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app\nSKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.com\nSKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx\n`
      : `# Skill Hub shared Shopify configuration\n# Keep this file private. Do not commit it or paste tokens into chat.\n\nSKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app\nSKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com\nSKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id\n`;

  const exists = await fs.readFile(envFile, "utf8").then(() => true).catch(() => false);
  if (!exists) await fs.writeFile(envFile, template, "utf8");
  const gitignoreUpdated = await ensureGitignoreLine(envFile);
  console.log(JSON.stringify({ ok: true, envFile, created: !exists, gitignoreUpdated, requiredScopes: REQUIRED_SCOPES }, null, 2));
}

async function shopifyCliFetch({ env = {}, shop, query, variables, allowMutations = false }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-hub-shopify-cli-"));
  const queryFile = path.join(tempDir, "query.graphql");
  const variableFile = path.join(tempDir, "variables.json");
  const outputFile = path.join(tempDir, "output.json");
  try {
    const cliJs = await resolveShopifyCliJs(env);
    await fs.writeFile(queryFile, query, "utf8");
    await fs.writeFile(variableFile, JSON.stringify(variables || {}), "utf8");
    const cliArgs = [
      cliJs,
      "store",
      "execute",
      "--store",
      shop,
      "--query-file",
      queryFile,
      "--variable-file",
      variableFile,
      "--output-file",
      outputFile,
      "--json",
      "--no-color",
    ];
    if (allowMutations) cliArgs.push("--allow-mutations");
    const execResult = await execFileAsync(process.execPath, cliArgs, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 30,
      timeout: 180000,
      windowsHide: true,
    }).catch((error) => ({ cliError: classifyCliError(error, [error.stderr, error.stdout].filter(Boolean).map(String).join("\n")) }));
    if (execResult.cliError) fail(`${execResult.cliError.code}: ${execResult.cliError.message}`);
    if (!await pathExists(outputFile)) fail("CLI_OUTPUT_MISSING: Shopify CLI did not create output JSON.");
    try {
      const raw = JSON.parse(await fs.readFile(outputFile, "utf8"));
      if (raw?.errors) return { errors: raw.errors };
      return raw?.data ? raw : { data: raw };
    } catch (error) {
      fail(`CLI_JSON_PARSE_FAILED: ${error.message}`);
    }
  } catch (error) {
    fail(error.message);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function pathExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

async function resolveShopifyCliJs(env = {}) {
  const candidates = [];
  if (env.SKILL_HUB_SHOPIFY_CLI_JS || process.env.SKILL_HUB_SHOPIFY_CLI_JS) candidates.push(env.SKILL_HUB_SHOPIFY_CLI_JS || process.env.SKILL_HUB_SHOPIFY_CLI_JS);
  const npmRoot = await execFileAsync("npm", ["root", "-g"], { windowsHide: true })
    .then(({ stdout }) => stdout.trim())
    .catch(() => "");
  if (npmRoot) candidates.push(path.join(npmRoot, "@shopify", "cli", "bin", "run.js"));
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules", "@shopify", "cli", "bin", "run.js"));
  for (const candidate of candidates) {
    if (candidate && await pathExists(candidate)) return candidate;
  }
  fail("CLI_NOT_FOUND: Could not locate Shopify CLI JS entrypoint. Set SKILL_HUB_SHOPIFY_CLI_JS to @shopify/cli/bin/run.js.");
}

function classifyCliError(error, detail = "") {
  const text = `${detail}\n${error?.message || ""}`;
  if (error?.code === "ENOENT" || error?.code === "EINVAL" || error?.code === "EFTYPE") return { code: "CLI_SPAWN_FAILED", message: error.message };
  if (/access denied|denied access/i.test(text)) return { code: "CLI_ACCESS_DENIED", message: text.trim() };
  if (/store auth|stored store auth|auth.*required|not authenticated|login/i.test(text)) return { code: "CLI_AUTH_REQUIRED", message: text.trim() };
  return { code: "CLI_SPAWN_FAILED", message: text.trim() || "Shopify CLI request failed." };
}

async function adminFetch({ shop, version, token, query, variables }) {
  const response = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`Shopify Admin request failed (${response.status}): ${JSON.stringify(json)}`);
  }
  return { json, version: response.headers.get("x-shopify-api-version") || version };
}

async function resolveAdmin(env) {
  const method = env.SKILL_HUB_SHOPIFY_ACCESS_METHOD || "admin_custom_app";
  const inputDomain = normalizeDomain(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  if (!inputDomain) fail("Missing SKILL_HUB_SHOPIFY_STORE_DOMAIN.");

  if (method === "dev_dashboard_app") {
    if (!inputDomain.endsWith(".myshopify.com")) {
      fail("Dev Dashboard app mode requires the exact .myshopify.com store domain.");
    }
    await shopifyCliFetch({
      env,
      shop: inputDomain,
      query: "query SkillHubSerpConnectionCheck { shop { name myshopifyDomain } }",
      variables: {},
    });
    return { mode: "cli", shop: inputDomain, env };
  }

  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (!token) fail("Missing SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN.");

  const versions = env.SKILL_HUB_SHOPIFY_API_VERSION
    ? [env.SKILL_HUB_SHOPIFY_API_VERSION, ...DEFAULT_VERSION_CANDIDATES]
    : DEFAULT_VERSION_CANDIDATES;
  const uniqueVersions = [...new Set(versions)];

  let shop = inputDomain;
  if (!shop.endsWith(".myshopify.com")) {
    const probeVersion = uniqueVersions[0];
    const probe = await fetch(`https://${shop}/admin/api/${probeVersion}/graphql.json`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: "query SkillHubProbe { shop { myshopifyDomain } }" }),
    }).catch(() => null);
    const location = probe?.headers?.get?.("location");
    if (location && /\.myshopify\.com/i.test(location)) {
      shop = new URL(location).host.toLowerCase();
    }
  }

  for (const version of uniqueVersions) {
    const result = await adminFetch({
      shop,
      version,
      token,
      query: "query SkillHubSerpConnectionCheck { shop { name myshopifyDomain } }",
      variables: {},
    }).catch(() => null);
    if (result?.json?.data?.shop) {
      return { mode: "admin_token", shop, version: result.version, token };
    }
  }

  fail("Could not verify Shopify Admin access with the provided env values.");
}

async function gql(client, query, variables = {}) {
  if (client.mode === "cli") {
    const allowMutations = /(^|\n)\s*mutation\b/i.test(query);
    const result = await shopifyCliFetch({ env: client.env, shop: client.shop, query, variables, allowMutations });
    if (result.errors) fail(`Shopify GraphQL errors: ${JSON.stringify(result.errors)}`);
    return result.data || result;
  }
  const result = await adminFetch({
    shop: client.shop,
    version: client.version,
    token: client.token,
    query,
    variables,
  });
  if (result.json.errors) fail(`Shopify GraphQL errors: ${JSON.stringify(result.json.errors)}`);
  return result.json.data;
}

function handleFromUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const productsIndex = parts.indexOf("products");
    if (productsIndex !== -1 && parts[productsIndex + 1]) return parts[productsIndex + 1];
    const collectionsIndex = parts.indexOf("collections");
    if (collectionsIndex !== -1 && parts[collectionsIndex + 1]) return parts[collectionsIndex + 1];
  } catch {
    return raw;
  }
  return raw;
}

const PRODUCT_QUERY = `query SerpOptimizerProduct($identifier: ProductIdentifierInput!) {
  product: productByIdentifier(identifier: $identifier) {
    id
    title
    handle
    status
    onlineStoreUrl
    description
    descriptionHtml
    vendor
    productType
    tags
    seo { title description }
    options { name values }
    variants(first: 20) { nodes { id title sku availableForSale selectedOptions { name value } price } }
    priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
    media(first: 20) { nodes { id alt mediaContentType preview { image { url width height } } } }
    collections(first: 10) { nodes { id title handle } }
  }
}`;

const COLLECTION_QUERY = `query SerpOptimizerCollection($identifier: CollectionIdentifierInput!, $first: Int!, $after: String) {
  collection: collectionByIdentifier(identifier: $identifier) {
    id
    title
    handle
    description
    seo { title description }
    products(first: $first, after: $after, sortKey: BEST_SELLING) {
      nodes { id title handle status onlineStoreUrl seo { title description } productType vendor tags }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const PRODUCTS_SCAN_QUERY = `query SerpOptimizerProductScan($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id
      title
      handle
      status
      onlineStoreUrl
      description
      vendor
      productType
      tags
      seo { title description }
      media(first: 10) { nodes { id alt mediaContentType } }
      collections(first: 5) { nodes { id title handle } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function connectionCheck(args) {
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const data = await gql(client, "query SkillHubSerpConnectionCheck { shop { name myshopifyDomain primaryDomain { host url } } }");
  console.log(JSON.stringify({ ok: true, shop: data.shop, mode: client.mode }, null, 2));
}

async function productCommand(args) {
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const identifier = args.id
    ? { id: args.id }
    : { handle: handleFromUrl(args.handle || args.url || args._[0]) };
  if (!identifier.id && !identifier.handle) fail("Provide --id, --handle, --url, or a product URL/handle argument.");
  const data = await gql(client, PRODUCT_QUERY, { identifier });
  if (!data.product) fail("Product not found.");
  console.log(JSON.stringify({ ok: true, product: data.product }, null, 2));
}

async function collectionPreview(args) {
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const limit = Math.min(Math.max(Number(args.limit || 20), 1), 50);
  const handle = handleFromUrl(args.handle || args.url || args._[0]);
  if (!handle) fail("Provide --handle, --url, or a collection URL/handle argument.");
  const data = await gql(client, COLLECTION_QUERY, {
    identifier: { handle },
    first: limit,
    after: null,
  });
  if (!data.collection) fail("Collection not found.");
  console.log(JSON.stringify({ ok: true, collection: data.collection, note: "Internal narrowing helper. Main workflow should still plan five-product batches." }, null, 2));
}

function textLength(value) {
  return String(value || "").replace(/\s+/g, " ").trim().length;
}

function isWeakText(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (text.length < 35) return true;
  const weakPatterns = [
    /^shop\s+/,
    /^buy\s+/,
    /high[- ]quality/,
    /premium/,
    /best seller/,
    /new arrival/,
    /perfect for/,
    /must[- ]have/,
    /discover/,
    /browse/,
    /free shipping/,
  ];
  return weakPatterns.some((pattern) => pattern.test(text));
}

function mediaStats(product) {
  const media = product?.media?.nodes || [];
  const alts = media.map((item) => String(item.alt || "").trim()).filter(Boolean);
  const missingAlt = media.length - alts.length;
  const repeatedAlt = alts.length - new Set(alts.map((alt) => alt.toLowerCase())).size;
  const overlongAlt = alts.filter((alt) => alt.length > 160).length;
  const genericAlt = alts.filter((alt) => isWeakText(alt)).length;
  return { total: media.length, missingAlt, repeatedAlt, overlongAlt, genericAlt };
}

function scoreProduct(product) {
  let score = 0;
  const reasons = [];
  const exclusions = [];
  const status = String(product.status || "");
  const hasOnlineUrl = Boolean(product.onlineStoreUrl);
  const seoTitle = product.seo?.title || "";
  const seoDescription = product.seo?.description || "";
  const descriptionLen = textLength(product.description);
  const titleWeak = isWeakText(seoTitle) || String(seoTitle).toLowerCase().includes(String(product.vendor || "").toLowerCase()) && String(seoTitle).length < 45;
  const metaWeak = isWeakText(seoDescription);
  const stats = mediaStats(product);

  if (status === "ACTIVE" && hasOnlineUrl) {
    score += 25;
    reasons.push("Active storefront product");
  } else {
    exclusions.push(hasOnlineUrl ? `Storefront status is ${status || "unknown"}` : "No onlineStoreUrl");
    score -= 40;
  }

  if (!seoTitle) {
    score += 22;
    reasons.push("SEO title missing");
  } else if (titleWeak) {
    score += 14;
    reasons.push("SEO title looks weak, generic, or under-specified");
  }

  if (!seoDescription) {
    score += 24;
    reasons.push("Meta description missing");
  } else if (metaWeak) {
    score += 16;
    reasons.push("Meta description looks generic or intent-light");
  }

  if (descriptionLen >= 350) {
    score += 14;
    reasons.push("Product description has evidence that can support SERP metadata");
  } else if (descriptionLen >= 120) {
    score += 8;
    reasons.push("Product description has some evidence but likely needs content support");
  } else {
    score += 4;
    reasons.push("Thin product description; metadata changes should stay conservative");
  }

  if (stats.total > 0 && (stats.missingAlt || stats.repeatedAlt || stats.overlongAlt || stats.genericAlt)) {
    const altPoints = Math.min(18, stats.missingAlt * 3 + stats.repeatedAlt * 3 + stats.overlongAlt * 2 + stats.genericAlt);
    score += altPoints;
    reasons.push("Product media alt text has improvement signals");
  }

  const productType = String(product.productType || "").trim();
  const collections = (product.collections?.nodes || []).map((item) => item.title).filter(Boolean);
  if (productType || collections.length) {
    score += 8;
    reasons.push("Product has category context for intent classification");
  }

  if (status === "ARCHIVED") exclusions.push("Archived products should not be optimized");
  if (!descriptionLen) exclusions.push("No product description evidence");

  const eligible = status === "ACTIVE" && hasOnlineUrl && !exclusions.some((item) => item.includes("Archived"));
  return {
    productId: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    onlineStoreUrl: product.onlineStoreUrl,
    productType: product.productType,
    vendor: product.vendor,
    seoTitle,
    seoDescription,
    descriptionLength: descriptionLen,
    media: stats,
    collections,
    opportunityScore: Math.max(0, Math.min(100, score)),
    eligible,
    reasons,
    exclusions,
  };
}

async function readAllProducts(client, args) {
  const pageSize = Math.min(Math.max(Number(args["page-size"] || 50), 1), 100);
  const maxProducts = Math.min(Math.max(Number(args.limit || MAX_SCAN_PRODUCTS), 1), 500);
  const query = args.query ? String(args.query) : null;
  const products = [];
  let after = null;
  while (products.length < maxProducts) {
    const data = await gql(client, PRODUCTS_SCAN_QUERY, { first: Math.min(pageSize, maxProducts - products.length), after, query });
    const connection = data.products;
    products.push(...(connection.nodes || []));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  return products;
}

async function scanProducts(args) {
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const products = await readAllProducts(client, args);
  const candidates = products.map(scoreProduct).sort((a, b) => b.opportunityScore - a.opportunityScore);
  const eligible = candidates.filter((item) => item.eligible);
  const excluded = candidates.filter((item) => !item.eligible);
  console.log(JSON.stringify({
    ok: true,
    scannedProductCount: products.length,
    eligibleProductCount: eligible.length,
    excludedProductCount: excluded.length,
    candidates,
  }, null, 2));
}

function createBatches(candidates, batchSize) {
  const eligible = candidates.filter((item) => item.eligible).sort((a, b) => b.opportunityScore - a.opportunityScore);
  const batches = [];
  for (let i = 0; i < eligible.length; i += batchSize) {
    const products = eligible.slice(i, i + batchSize);
    const index = batches.length + 1;
    const summary =
      index === 1
        ? "Highest-confidence product SERP updates"
        : index === 2
          ? "Useful SERP opportunities that may need content support"
          : "Lower-priority opportunities or products needing more evidence";
    batches.push({
      name: `Batch ${index}`,
      summary,
      products: products.map((product) => ({
        productId: product.productId,
        title: product.title,
        handle: product.handle,
        onlineStoreUrl: product.onlineStoreUrl,
        opportunityScore: product.opportunityScore,
        reasons: product.reasons,
      })),
    });
  }
  return batches;
}

async function batchPlan(args) {
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const batchSize = Math.min(Math.max(Number(args["batch-size"] || DEFAULT_BATCH_SIZE), 1), 10);
  const products = await readAllProducts(client, args);
  const candidates = products.map(scoreProduct).sort((a, b) => b.opportunityScore - a.opportunityScore);
  const batches = createBatches(candidates, batchSize);
  console.log(JSON.stringify({
    ok: true,
    scannedProductCount: products.length,
    eligibleProductCount: candidates.filter((item) => item.eligible).length,
    excludedProductCount: candidates.filter((item) => !item.eligible).length,
    batchSize,
    batches,
    excluded: candidates.filter((item) => !item.eligible).map((item) => ({
      title: item.title,
      handle: item.handle,
      exclusions: item.exclusions,
    })),
  }, null, 2));
}

async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function loadJsonInput(input) {
  const text = input === "-" ? await readStdin() : await fs.readFile(input, "utf8");
  if (!text.trim()) fail("Missing JSON input.");
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`Could not parse JSON input: ${error.message}`);
  }
}

function validatePlan(plan) {
  const changes = Array.isArray(plan?.changes) ? plan.changes : [];
  const errors = [];
  for (const [index, change] of changes.entries()) {
    if (change.type === "product_seo") {
      if (!change.productId) errors.push(`changes[${index}].productId is required`);
      if (!change.seoTitle && !change.seoDescription) {
        errors.push(`changes[${index}] must include seoTitle or seoDescription`);
      }
      for (const forbidden of ["title", "handle", "descriptionHtml", "tags", "productType", "vendor"]) {
        if (Object.prototype.hasOwnProperty.call(change, forbidden)) {
          errors.push(`changes[${index}] must not include ${forbidden}`);
        }
      }
      if (change.seoTitle && String(change.seoTitle).length > 255) {
        errors.push(`changes[${index}].seoTitle is unusually long; revise before applying`);
      }
      if (change.seoDescription && String(change.seoDescription).length > 500) {
        errors.push(`changes[${index}].seoDescription is unusually long; revise before applying`);
      }
    } else if (change.type === "product_media_alt") {
      if (!change.id) errors.push(`changes[${index}].id is required`);
      if (!change.alt || !String(change.alt).trim()) errors.push(`changes[${index}].alt is required`);
      if (String(change.alt || "").length > 512) errors.push(`changes[${index}].alt exceeds 512 characters`);
    } else {
      errors.push(`changes[${index}].type is unsupported: ${change.type}`);
    }
  }
  if (!changes.length) errors.push("No changes found.");
  if (errors.length) fail(errors.join("; "));
  return changes;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && String(item).trim() !== "") : [];
}

function list(items, empty = "No item provided.") {
  const values = plainArray(items);
  if (!values.length) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<ul class="clean-list">${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function keyValues(items, empty = "No details provided.") {
  const values = plainArray(items);
  if (!values.length) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<div class="kv-list">${values.map((item) => {
    if (typeof item === "string") return `<div><dt>Note</dt><dd>${escapeHtml(item)}</dd></div>`;
    const key = item.label || item.key || item.question || item.layer || item.type || "Item";
    const value = item.value || item.recommendation || item.query || item.fit || item.targetIntent || item.description || item.title || "";
    const extra = item.risk || item.evidence || item.notes || "";
    return `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}${extra ? `<span>${escapeHtml(extra)}</span>` : ""}</dd></div>`;
  }).join("")}</div>`;
}

function cards(items, fields) {
  const values = plainArray(items);
  if (!values.length) return `<p class="muted">No opportunity provided.</p>`;
  return `<div class="mini-grid">${values.map((item) => {
    const body = fields.map((field) => {
      const raw = item[field.key];
      if (raw === undefined || raw === null || raw === "") return "";
      return `<p><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(raw)}</p>`;
    }).filter(Boolean).join("");
    return `<article class="mini-card">${body}</article>`;
  }).join("")}</div>`;
}

function renderBatchPlan(batchPlan) {
  const batches = plainArray(batchPlan);
  if (!batches.length) return `<p class="muted">No batch plan provided.</p>`;
  return `<div class="batch-strip">${batches.map((batch) => {
    const products = plainArray(batch.products).map((product) => typeof product === "string" ? product : product.title || product.handle || "Untitled product");
    return `<article>
      <strong>${escapeHtml(batch.name || "Batch")}</strong>
      <span>${escapeHtml(batch.summary || "")}</span>
      ${list(products, "No products listed.")}
    </article>`;
  }).join("")}</div>`;
}

function renderCommunity(community = {}) {
  const redditSearches = plainArray(community.redditSearches);
  const bloggerSearches = plainArray(community.bloggerSearches);
  const facebookSearches = plainArray(community.facebookGroupSearches);
  return `<div class="community-grid">
    <div><h4>Community types</h4>${list(community.subredditTypes || community.communityTypes, "No community types provided.")}</div>
    <div><h4>Reddit search operators</h4>${list(redditSearches, "No Reddit searches provided.")}</div>
    <div><h4>Blogger search operators</h4>${list(bloggerSearches, "No blogger searches provided.")}</div>
    <div><h4>Facebook group searches</h4>${list(facebookSearches, "No Facebook searches provided.")}</div>
    <div><h4>Post angle</h4><p>${escapeHtml(community.postAngle || "Ask or share a specific useful experience before mentioning a product.")}</p></div>
    <div><h4>Reply angle</h4><p>${escapeHtml(community.replyAngle || "Solve the problem first, then mention a relevant guide or product only when useful.")}</p></div>
  </div>`;
}

function renderProduct(product, index) {
  const score = product.serpScore ?? product.score ?? "N/A";
  const executableFields = product.executableFields || [];
  const doNotTouch = product.doNotTouch || ["handle", "descriptionHtml", "theme", "redirects", "translations"];
  return `<section class="product-page">
    <div class="product-hero">
      <p class="eyebrow">Product page ${index + 1}</p>
      <h2>${escapeHtml(product.title || "Untitled product")}</h2>
      <p>${escapeHtml(product.url || product.handle || "")}</p>
    </div>
    <div class="bento">
      <article class="card score-card">
        <h3>🎯 SERP score</h3>
        <p class="score">${escapeHtml(score)}</p>
        <p>${escapeHtml(product.scoreSummary || "Score reflects intent fit, evidence, uniqueness, readability, and risk control.")}</p>
      </article>
      <article class="card">
        <h3>🧾 Product snapshot</h3>
        ${keyValues([
          { label: "Status", value: product.status || "Unknown" },
          { label: "Product type", value: product.productType || "Not provided" },
          { label: "Audience/use", value: product.audience || product.useCase || "Needs classification" },
          { label: "URL", value: product.url || product.handle || "Not provided" },
        ])}
      </article>
      <article class="card wide">
        <h3>🔎 Current search snippet</h3>
        <div class="snippet">
          <strong>SEO title</strong>
          <p>${escapeHtml(product.currentSeoTitle || "Missing")}</p>
        </div>
        <div class="snippet">
          <strong>Meta description</strong>
          <p>${escapeHtml(product.currentMetaDescription || "Missing")}</p>
        </div>
      </article>
      <article class="card wide recommend">
        <h3>✍️ Recommended search snippet</h3>
        <div class="snippet">
          <strong>SEO title</strong>
          <p>${escapeHtml(product.recommendedSeoTitle || "No title change recommended.")}</p>
        </div>
        <div class="snippet">
          <strong>Meta description</strong>
          <p>${escapeHtml(product.recommendedMetaDescription || "No meta description change recommended.")}</p>
        </div>
      </article>
      <article class="card">
        <h3>📌 Evidence ledger</h3>
        ${list(product.evidence, "No evidence provided.")}
      </article>
      <article class="card">
        <h3>🪜 Micro-intent ladder</h3>
        ${keyValues(product.microIntents, "No micro-intents provided.")}
      </article>
      <article class="card wide">
        <h3>🧠 Content gap and buyer objections</h3>
        ${keyValues(product.contentGaps, "No content gaps provided.")}
      </article>
      <article class="card">
        <h3>🖼️ Alt text action</h3>
        <p>${escapeHtml(product.altTextAction || "No alt text action provided.")}</p>
      </article>
      <article class="card wide">
        <h3>📰 Blog/article opportunity map</h3>
        ${cards(product.blogTopics, [
          { key: "type", label: "Cluster" },
          { key: "targetIntent", label: "Intent" },
          { key: "suggestedTitle", label: "Suggested title" },
          { key: "whyProductSupportsIt", label: "Why this product supports it" },
          { key: "targetReader", label: "Reader" },
          { key: "internalLinkAnchor", label: "Internal anchor" },
          { key: "risk", label: "Risk/evidence needed" },
        ])}
      </article>
      <article class="card wide">
        <h3>🌐 Distribution and off-page opportunity</h3>
        ${renderCommunity(product.community)}
      </article>
      <article class="card">
        <h3>✅ Exact executable fields</h3>
        ${list(executableFields, "No safe executable field recommended.")}
      </article>
      <article class="card">
        <h3>🚫 Do-not-touch fields</h3>
        ${list(doNotTouch, "No protected fields listed.")}
      </article>
    </div>
  </section>`;
}

function reportTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

async function reportCommand(args) {
  const input = await loadJsonInput(args.input || "-");
  const template = await fs.readFile(REPORT_TEMPLATE, "utf8").catch((error) => fail(`Missing report template: ${error.message}`));
  const generatedAt = input.generatedAt || new Date().toISOString();
  const products = plainArray(input.products);
  const output = args.output || `shopify-serp-report-${reportTimestamp()}.html`;
  const title = input.title || "Shopify Product SERP Audit";
  const overview = `<section class="cover">
    <p class="eyebrow">SERP Product Audit</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">Evidence-backed product search snippet recommendations, content opportunities, and safe Shopify execution boundaries.</p>
    <div class="cover-grid">
      <article><span>Store</span><strong>${escapeHtml(input.store?.name || input.store?.domain || "Unknown store")}</strong><small>${escapeHtml(input.store?.domain || "")}</small></article>
      <article><span>Generated</span><strong>${escapeHtml(generatedAt)}</strong><small>Local HTML report</small></article>
      <article><span>Products scanned</span><strong>${escapeHtml(input.productCount ?? input.scannedProductCount ?? products.length)}</strong><small>${escapeHtml(input.eligibleProductCount ?? "")} eligible</small></article>
      <article><span>Executable items</span><strong>${escapeHtml(input.executableItemCount ?? 0)}</strong><small>Requires approval before write</small></article>
    </div>
    <div class="cover-section">
      <h2>📦 Batch plan</h2>
      ${renderBatchPlan(input.batchPlan)}
    </div>
    <div class="cover-section boundaries">
      <h2>🛡️ Boundaries</h2>
      <p>This report may recommend safe seo.title, seo.description, and reviewed media alt text updates. It does not modify handles, redirects, translations, theme code, schema, reviews, ratings, prices, variants, tags, vendor, collections, or product copy.</p>
    </div>
  </section>`;
  const productSections = products.map(renderProduct).join("\n");
  const html = template
    .replaceAll("{{REPORT_TITLE}}", escapeHtml(title))
    .replaceAll("{{GENERATED_AT}}", escapeHtml(generatedAt))
    .replace("{{REPORT_CONTENT}}", `${overview}\n${productSections}`);
  await fs.writeFile(output, html, "utf8");
  console.log(JSON.stringify({ ok: true, output: path.resolve(output), products: products.length }, null, 2));
}

async function applyCommand(args) {
  const plan = await loadJsonInput(args.input || "-");
  const changes = validatePlan(plan);
  const execute = Boolean(args.execute);

  if (!execute) {
    console.log(JSON.stringify({ ok: true, preview: true, changes }, null, 2));
    return;
  }

  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const results = [];

  for (const change of changes.filter((item) => item.type === "product_seo")) {
    const product = { id: change.productId, seo: {} };
    if (change.seoTitle) product.seo.title = String(change.seoTitle);
    if (change.seoDescription) product.seo.description = String(change.seoDescription);
    const data = await gql(
      client,
      `mutation SerpOptimizerProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id title handle seo { title description } }
          userErrors { field message }
        }
      }`,
      { product },
    );
    results.push({ type: "product_seo", productId: change.productId, response: data.productUpdate });
  }

  const fileUpdates = changes
    .filter((item) => item.type === "product_media_alt")
    .map((item) => ({ id: item.id, alt: String(item.alt) }));
  if (fileUpdates.length) {
    const data = await gql(
      client,
      `mutation SerpOptimizerFileUpdate($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) {
          files { id alt fileStatus }
          userErrors { field message code }
        }
      }`,
      { files: fileUpdates },
    );
    results.push({ type: "product_media_alt", response: data.fileUpdate });
  }

  console.log(JSON.stringify({ ok: true, executed: true, results }, null, 2));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === "init-env") return initEnv(args);
  if (command === "connection-check") return connectionCheck(args);
  if (command === "product") return productCommand(args);
  if (command === "collection-preview") return collectionPreview(args);
  if (command === "scan-products") return scanProducts(args);
  if (command === "batch-plan") return batchPlan(args);
  if (command === "report") return reportCommand(args);
  if (command === "apply") return applyCommand(args);
  fail(`Unknown command: ${command || "(missing)"}`);
}

main().catch((error) => fail(error.stack || error.message));
