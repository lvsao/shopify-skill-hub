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

function assertReportTemplateCompliance(template, html) {
  const templateChecks = [
    { marker: 'class="export-button"', label: "template export button" },
    { marker: 'onclick="window.print()"', label: "template print handler" },
    { marker: "@media print", label: "template print styles" },
  ];
  for (const check of templateChecks) {
    if (!String(template).includes(check.marker)) fail(`Report template is incomplete: missing ${check.label}.`);
    if (!String(html).includes(check.marker)) fail(`Generated report is incomplete: missing ${check.label}. Regenerate from the bundled template before delivery.`);
  }
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
  if (!text) {
    fail(`Missing env file: ${file}. Current working directory: ${process.cwd()}. The env must be in the user's working directory, not the installed skill directory. Run from the folder that contains skill-hub.env, or pass an absolute path such as --env "<USER_WORKDIR>\\skill-hub.env".`);
  }
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
    metafields(first: 50) { nodes { id namespace key type value description definition { id name namespace key description type { name category } } } }
  }
}`;

const PRODUCT_UPDATE_READ_QUERY = `query SerpOptimizerProductUpdateRead($identifier: ProductIdentifierInput!) {
  product: productByIdentifier(identifier: $identifier) {
    id
    title
    handle
    descriptionHtml
    seo { title description }
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

const METAFIELD_DEFINITIONS_QUERY = `query SerpOptimizerMetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int!, $after: String) {
  metafieldDefinitions(ownerType: $ownerType, first: $first, after: $after) {
    nodes {
      id
      name
      namespace
      key
      description
      ownerType
      metafieldsCount
      type { name category }
      validations { name value }
      access { admin storefront customerAccount }
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

function identifierFromArgs(args) {
  return args.id
    ? { id: args.id }
    : { handle: handleFromUrl(args.handle || args.url || args.product || args._[0]) };
}

function inferMetafieldModule(definition, metafield) {
  const text = `${definition?.name || ""} ${definition?.namespace || ""} ${definition?.key || ""} ${definition?.description || ""} ${metafield?.namespace || ""} ${metafield?.key || ""}`.toLowerCase();
  if (/review|rating|judgeme|stamped|loox/.test(text)) return "Review";
  if (/material|fabric/.test(text)) return "Material";
  if (/spec|technical|attribute/.test(text)) return "Specification";
  if (/dimension|size|length|width|height|depth|weight/.test(text)) return "Dimension";
  if (/detail|care|ingredient|compatib|fit/.test(text)) return "Product Detail";
  if (/feature|benefit|highlight/.test(text)) return "Features";
  if (/google|shopping/.test(text)) return "Google Shopping";
  return "Custom Data";
}

async function fetchAllMetafieldDefinitions(client, ownerType = "PRODUCT", pageSize = 100) {
  const nodes = [];
  let after = null;
  do {
    const data = await gql(client, METAFIELD_DEFINITIONS_QUERY, { ownerType, first: pageSize, after });
    nodes.push(...(data.metafieldDefinitions?.nodes || []));
    after = data.metafieldDefinitions?.pageInfo?.hasNextPage ? data.metafieldDefinitions.pageInfo.endCursor : null;
  } while (after);
  return nodes;
}

function buildMetafieldAudit(product, definitions) {
  const values = product?.metafields?.nodes || [];
  const valueByKey = new Map(values.map((item) => [`${item.namespace}.${item.key}`, item]));
  const populatedDefinitions = [];
  const missingDefinitions = [];
  const modules = new Map();

  for (const definition of definitions) {
    const mapKey = `${definition.namespace}.${definition.key}`;
    const value = valueByKey.get(mapKey) || null;
    const module = inferMetafieldModule(definition, value);
    modules.set(module, (modules.get(module) || 0) + 1);
    const item = {
      module,
      name: definition.name,
      namespace: definition.namespace,
      key: definition.key,
      type: definition.type?.name,
      category: definition.type?.category,
      description: definition.description || "",
      metafieldsCount: definition.metafieldsCount,
      value: value?.value || null,
      valuePreview: value ? String(value.value).slice(0, 180) : null,
    };
    if (value) populatedDefinitions.push(item);
    else missingDefinitions.push(item);
  }

  const valueOnlyMetafields = values
    .filter((item) => !definitions.some((definition) => definition.namespace === item.namespace && definition.key === item.key))
    .map((item) => ({
      module: inferMetafieldModule(null, item),
      namespace: item.namespace,
      key: item.key,
      type: item.type,
      valuePreview: String(item.value).slice(0, 180),
    }));

  return {
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
    },
    definitionCount: definitions.length,
    productValueCount: values.length,
    modules: [...modules.entries()].map(([name, count]) => ({ name, count })),
    populatedDefinitions,
    missingDefinitions,
    valueOnlyMetafields,
  };
}

async function metafieldAuditCommand(args) {
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const identifier = identifierFromArgs(args);
  if (!identifier.id && !identifier.handle) fail("Provide --id, --handle, --url, --product, or a product URL/handle argument.");
  const productData = await gql(client, PRODUCT_QUERY, { identifier });
  const definitions = await fetchAllMetafieldDefinitions(client, "PRODUCT");
  if (!productData.product) fail("Product not found.");
  const audit = buildMetafieldAudit(productData.product, definitions);
  console.log(JSON.stringify({ ok: true, audit }, null, 2));
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

function firstText(value, maxLength = 155) {
  const text = String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

function resolvedSeoFields(product) {
  const explicitTitle = product.seo?.title || product.seoTitle || product.currentSeoTitle || "";
  const explicitDescription = product.seo?.description || product.seoDescription || product.currentMetaDescription || "";
  const fallbackTitle = product.title || product.productTitle || "";
  const fallbackDescription = firstText(product.description || product.productDescription || product.descriptionHtml, 155);
  return {
    title: explicitTitle || fallbackTitle,
    titleSource: explicitTitle ? "explicit" : "shopify_title_fallback",
    description: explicitDescription || fallbackDescription,
    descriptionSource: explicitDescription ? "explicit" : "shopify_description_fallback",
  };
}

function scoreProduct(product) {
  let score = 0;
  const reasons = [];
  const exclusions = [];
  const status = String(product.status || "");
  const hasOnlineUrl = Boolean(product.onlineStoreUrl);
  const resolvedSeo = resolvedSeoFields(product);
  const seoTitle = resolvedSeo.title;
  const seoDescription = resolvedSeo.description;
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
    seoTitleSource: resolvedSeo.titleSource,
    seoDescriptionSource: resolvedSeo.descriptionSource,
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
    if (change.type === "product_full_bundle") {
      if (!change.productId) errors.push(`changes[${index}].productId is required`);
      const hasProductFields = ["productTitle", "descriptionHtml", "seoTitle", "seoDescription"].some((field) => {
        const value = change[field];
        return value !== undefined && value !== null && String(value).trim() !== "";
      });
      const altUpdates = Array.isArray(change.altUpdates) ? change.altUpdates : [];
      const metafieldUpdates = Array.isArray(change.metafieldUpdates) ? change.metafieldUpdates : [];
      if (!hasProductFields && !altUpdates.length && !metafieldUpdates.length) {
        errors.push(`changes[${index}] must include at least one product field, altUpdates, or metafieldUpdates`);
      }
      for (const forbidden of ["handle", "tags", "productType", "vendor", "status", "variants", "collections"]) {
        if (Object.prototype.hasOwnProperty.call(change, forbidden)) {
          errors.push(`changes[${index}] must not include ${forbidden}`);
        }
      }
      if (change.productTitle && String(change.productTitle).length > 255) {
        errors.push(`changes[${index}].productTitle is unusually long; revise before applying`);
      }
      if (change.descriptionHtml !== undefined && !String(change.descriptionHtml).trim()) {
        errors.push(`changes[${index}].descriptionHtml must not be empty when provided`);
      }
      if (change.seoTitle && String(change.seoTitle).length > 255) {
        errors.push(`changes[${index}].seoTitle is unusually long; revise before applying`);
      }
      if (change.seoDescription && String(change.seoDescription).length > 500) {
        errors.push(`changes[${index}].seoDescription is unusually long; revise before applying`);
      }
      for (const [altIndex, altUpdate] of altUpdates.entries()) {
        if (!altUpdate?.id) errors.push(`changes[${index}].altUpdates[${altIndex}].id is required`);
        if (!altUpdate?.alt || !String(altUpdate.alt).trim()) errors.push(`changes[${index}].altUpdates[${altIndex}].alt is required`);
        if (String(altUpdate?.alt || "").length > 512) errors.push(`changes[${index}].altUpdates[${altIndex}].alt exceeds 512 characters`);
      }
      for (const [metaIndex, metafieldUpdate] of metafieldUpdates.entries()) {
        if (!metafieldUpdate?.namespace) errors.push(`changes[${index}].metafieldUpdates[${metaIndex}].namespace is required`);
        if (!metafieldUpdate?.key) errors.push(`changes[${index}].metafieldUpdates[${metaIndex}].key is required`);
        if (!metafieldUpdate?.type) errors.push(`changes[${index}].metafieldUpdates[${metaIndex}].type is required`);
        if (metafieldUpdate?.value === undefined || metafieldUpdate?.value === null || String(metafieldUpdate.value).trim() === "") {
          errors.push(`changes[${index}].metafieldUpdates[${metaIndex}].value is required`);
        }
      }
    } else if (change.type === "product_seo") {
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
    } else if (change.type === "product_metafield") {
      if (!change.productId) errors.push(`changes[${index}].productId is required`);
      if (!change.namespace) errors.push(`changes[${index}].namespace is required`);
      if (!change.key) errors.push(`changes[${index}].key is required`);
      if (!change.type) errors.push(`changes[${index}].type is required`);
      if (change.value === undefined || change.value === null || String(change.value).trim() === "") {
        errors.push(`changes[${index}].value is required`);
      }
    } else {
      errors.push(`changes[${index}].type is unsupported: ${change.type}`);
    }
  }
  if (!changes.length) errors.push("No changes found.");
  if (errors.length) fail(errors.join("; "));
  return changes;
}

function bundleAltUpdates(change) {
  return Array.isArray(change?.altUpdates)
    ? change.altUpdates.map((item) => ({ id: item.id, alt: String(item.alt) }))
    : [];
}

function bundleMetafieldUpdates(change) {
  return Array.isArray(change?.metafieldUpdates)
    ? change.metafieldUpdates.map((item) => ({
      ownerId: change.productId,
      namespace: item.namespace,
      key: item.key,
      type: item.type,
      value: String(item.value),
    }))
    : [];
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

const REPORT_COPY = {
  en: {
    lang: "en",
    reportTitle: "Product SEO Opportunity Report",
    exportPdf: "Export as PDF",
    coverEyebrow: "Store SEO snapshot",
    coverLead: "A quick, plain-English view of which product pages were reviewed and where the biggest search-result improvements may come from.",
    store: "Store",
    totalProducts: "Total products",
    auditedProducts: "Products reviewed",
    averageScore: "Average SEO score",
    estimatedLift: "Estimated improvement",
    scoreNote: "This is an estimate for product page search-snippet quality, not a ranking promise.",
    topTakeaways: "Key takeaways",
    noTakeaways: "No key takeaways provided.",
    productPage: "Product",
    score: "SEO score",
    scoreSummary: "Higher means the product page has clearer search wording, stronger product evidence, and fewer risky claims.",
    snapshot: "Product snapshot",
    currentProductCopy: "Current product copy",
    recommendedProductCopy: "Recommended product copy",
    productTitle: "Product title",
    productDescription: "Product description",
    status: "Status",
    productType: "Product type",
    audience: "Best-fit shopper/use",
    url: "Page URL",
    currentSnippet: "What search engines can use now",
    recommendedSnippet: "Recommended wording",
    seoTitle: "SEO title",
    metaDescription: "Meta description",
    fallbackTitle: "Using Shopify default: product title",
    fallbackDescription: "Using Shopify default: first part of product description",
    explicitField: "Custom SEO field",
    evidence: "Proof found on the product page",
    evidenceEmpty: "No proof was provided.",
    microIntent: "Search ideas to target",
    microIntentEmpty: "No search ideas provided.",
    contentGaps: "What shoppers may still need to know",
    contentGapsEmpty: "No content gaps provided.",
    metafieldsAudit: "Metafields and advanced snippets audit",
    metafieldsModules: "Detected modules",
    metafieldsPopulated: "Populated metafields",
    metafieldsMissing: "Defined but missing values",
    metafieldsValueOnly: "Value-only metafields",
    metafieldsNamespace: "Namespace",
    metafieldsKey: "Key",
    metafieldsType: "Type",
    metafieldsValue: "Value preview",
    metafieldsModule: "Module",
    altText: "Image alt text",
    enhancedSnippets: "Enhanced snippets suggestions",
    enhancedEvidenceRule: "Evidence rule",
    enhancedFaq: "FAQ directions",
    enhancedComparison: "Comparison directions",
    enhancedHowTo: "How-to directions",
    enhancedDetails: "Details and specs directions",
    enhancedFeatures: "Feature highlight directions",
    enhancedQuestion: "Question",
    enhancedAnswerDirection: "Answer direction",
    enhancedComparisonType: "Comparison",
    enhancedMetrics: "Comparison axes",
    enhancedTopic: "How-to topic",
    enhancedUserGoal: "User goal",
    enhancedAttribute: "Technical detail",
    enhancedWhyItMatters: "Why it matters",
    enhancedFeature: "Feature",
    enhancedBuyerValue: "Buyer value",
    enhancedMerchantEvidence: "Merchant evidence",
    enhancedGoogleEvidence: "Google intent evidence",
    enhancedAmazonEvidence: "Amazon intent evidence",
    blogMap: "Blog and guide ideas",
    blogType: "Type",
    blogIntent: "Intent",
    blogTitle: "Suggested title",
    blogWhy: "Why it fits",
    blogReader: "Reader",
    blogAnchor: "Internal link text",
    blogRisk: "Evidence needed",
    noOpportunity: "No opportunity provided.",
    community: "Where to discuss or promote carefully",
    communityTypes: "Community types",
    redditSearches: "Reddit searches",
    bloggerSearches: "Blogger searches",
    facebookSearches: "Facebook group searches",
    postAngle: "Post idea",
    replyAngle: "Reply idea",
    executable: "What I can safely update after approval",
    noExecutable: "No safe update recommended.",
    labelNote: "Note",
    generated: "Generated",
    reviewed: "Reviewed",
  },
  zh: {
    lang: "zh-CN",
    reportTitle: "商品 SEO 机会报告",
    exportPdf: "导出为 PDF",
    coverEyebrow: "店铺 SEO 快速概览",
    coverLead: "这是一份给新手也能看懂的商品搜索结果优化摘要：先看哪些商品被审查了，再看最值得改哪里。",
    store: "店铺",
    totalProducts: "店铺商品总数",
    auditedProducts: "本次已审商品",
    averageScore: "平均 SEO 分数",
    estimatedLift: "预计改善空间",
    scoreNote: "这是对商品搜索摘要质量的估算，不是排名承诺。",
    topTakeaways: "关键结论",
    noTakeaways: "暂无关键结论。",
    productPage: "商品",
    score: "SEO 分数",
    scoreSummary: "分数越高，代表商品页的搜索展示文案越清楚、证据越充分、风险越少。",
    snapshot: "商品概况",
    currentProductCopy: "当前商品文案",
    recommendedProductCopy: "建议商品文案",
    productTitle: "商品标题",
    productDescription: "商品描述",
    status: "状态",
    productType: "商品类型",
    audience: "适合的人群/场景",
    url: "页面链接",
    currentSnippet: "当前搜索结果可能展示的内容",
    recommendedSnippet: "建议改成这样",
    seoTitle: "SEO 标题",
    metaDescription: "Meta 描述",
    fallbackTitle: "使用 Shopify 默认规则：商品标题",
    fallbackDescription: "使用 Shopify 默认规则：商品描述前 155 个字符",
    explicitField: "已单独设置的 SEO 字段",
    evidence: "商品页中找到的依据",
    evidenceEmpty: "暂未提供依据。",
    microIntent: "可以瞄准的具体搜索词",
    microIntentEmpty: "暂未提供具体搜索词。",
    contentGaps: "买家可能还想知道什么",
    contentGapsEmpty: "暂未提供内容缺口。",
    metafieldsAudit: "Metafields / 高阶 Snippets 审计",
    metafieldsModules: "检测到的模块",
    metafieldsPopulated: "已填写的 Metafields",
    metafieldsMissing: "已定义但缺少值",
    metafieldsValueOnly: "仅检测到值的 Metafields",
    metafieldsNamespace: "命名空间",
    metafieldsKey: "Key",
    metafieldsType: "类型",
    metafieldsValue: "值预览",
    metafieldsModule: "模块",
    altText: "图片 Alt Text",
    enhancedSnippets: "Enhanced snippets 建议",
    enhancedEvidenceRule: "证据规则",
    enhancedFaq: "FAQ 方向",
    enhancedComparison: "Comparison 方向",
    enhancedHowTo: "How To 方向",
    enhancedDetails: "Details & Spec 方向",
    enhancedFeatures: "Features（Highlight）方向",
    enhancedQuestion: "问题",
    enhancedAnswerDirection: "回答方向",
    enhancedComparisonType: "对比对象",
    enhancedMetrics: "对比指标",
    enhancedTopic: "How To 主题",
    enhancedUserGoal: "用户目标",
    enhancedAttribute: "技术细节",
    enhancedWhyItMatters: "为什么重要",
    enhancedFeature: "Feature",
    enhancedBuyerValue: "买家价值",
    enhancedMerchantEvidence: "商户证据",
    enhancedGoogleEvidence: "Google 真实意图证据",
    enhancedAmazonEvidence: "Amazon 真实意图证据",
    blogMap: "博客和指南选题",
    blogType: "类型",
    blogIntent: "搜索意图",
    blogTitle: "建议标题",
    blogWhy: "为什么适合这个商品",
    blogReader: "目标读者",
    blogAnchor: "内链文字",
    blogRisk: "需要补充的证据",
    noOpportunity: "暂未提供机会。",
    community: "可以谨慎讨论或推广的地方",
    communityTypes: "社区类型",
    redditSearches: "Reddit 搜索式",
    bloggerSearches: "博主搜索式",
    facebookSearches: "Facebook 小组搜索式",
    postAngle: "发帖角度",
    replyAngle: "回复角度",
    executable: "用户批准后可以直接帮你修改",
    noExecutable: "暂不建议直接修改。",
    labelNote: "说明",
    generated: "生成时间",
    reviewed: "本次审查",
  },
  de: {
    lang: "de",
    reportTitle: "Produkt-SEO Chancenbericht",
    exportPdf: "Als PDF exportieren",
    coverEyebrow: "SEO Kurzüberblick",
    coverLead: "Ein einfacher Überblick: welche Produktseiten geprüft wurden und wo die größten Verbesserungen in Suchergebnissen möglich sind.",
    store: "Shop",
    totalProducts: "Produkte insgesamt",
    auditedProducts: "Geprüfte Produkte",
    averageScore: "Durchschnittlicher SEO-Wert",
    estimatedLift: "Geschätztes Verbesserungspotenzial",
    scoreNote: "Dies ist eine Schätzung der Snippet-Qualität, kein Ranking-Versprechen.",
    topTakeaways: "Wichtigste Hinweise",
    noTakeaways: "Keine Hinweise angegeben.",
    productPage: "Produkt",
    score: "SEO-Wert",
    scoreSummary: "Ein höherer Wert bedeutet klarere Suchtexte, bessere Produktbelege und weniger riskante Aussagen.",
    snapshot: "Produktüberblick",
    currentProductCopy: "Aktueller Produkttext",
    recommendedProductCopy: "Empfohlener Produkttext",
    productTitle: "Produkttitel",
    productDescription: "Produktbeschreibung",
    status: "Status",
    productType: "Produkttyp",
    audience: "Passende Käufer/Nutzung",
    url: "Seiten-URL",
    currentSnippet: "Was Suchmaschinen aktuell nutzen können",
    recommendedSnippet: "Empfohlene Formulierung",
    seoTitle: "SEO-Titel",
    metaDescription: "Meta-Beschreibung",
    fallbackTitle: "Shopify Standardregel: Produkttitel",
    fallbackDescription: "Shopify Standardregel: Anfang der Produktbeschreibung",
    explicitField: "Eigenes SEO-Feld",
    evidence: "Belege auf der Produktseite",
    evidenceEmpty: "Keine Belege angegeben.",
    microIntent: "Konkrete Suchideen",
    microIntentEmpty: "Keine Suchideen angegeben.",
    contentGaps: "Was Käufer noch wissen möchten",
    contentGapsEmpty: "Keine Inhaltslücken angegeben.",
    metafieldsAudit: "Metafields- und Advanced-Snippets-Audit",
    metafieldsModules: "Erkannte Module",
    metafieldsPopulated: "Befüllte Metafields",
    metafieldsMissing: "Definiert, aber ohne Wert",
    metafieldsValueOnly: "Nur wertbasierte Metafields",
    metafieldsNamespace: "Namespace",
    metafieldsKey: "Schlüssel",
    metafieldsType: "Typ",
    metafieldsValue: "Wertvorschau",
    metafieldsModule: "Modul",
    altText: "Bild-Alt-Text",
    enhancedSnippets: "Enhanced-Snippet-Empfehlungen",
    enhancedEvidenceRule: "Belegregel",
    enhancedFaq: "FAQ-Richtungen",
    enhancedComparison: "Vergleichsrichtungen",
    enhancedHowTo: "How-to-Richtungen",
    enhancedDetails: "Details- und Spezifikationsrichtungen",
    enhancedFeatures: "Feature-Highlights",
    enhancedQuestion: "Frage",
    enhancedAnswerDirection: "Antwort-Richtung",
    enhancedComparisonType: "Vergleich",
    enhancedMetrics: "Vergleichsachsen",
    enhancedTopic: "How-to-Thema",
    enhancedUserGoal: "Nutzerziel",
    enhancedAttribute: "Technisches Detail",
    enhancedWhyItMatters: "Warum es wichtig ist",
    enhancedFeature: "Feature",
    enhancedBuyerValue: "Käufernutzen",
    enhancedMerchantEvidence: "Händlerbeleg",
    enhancedGoogleEvidence: "Google-Intent-Beleg",
    enhancedAmazonEvidence: "Amazon-Intent-Beleg",
    blogMap: "Blog- und Ratgeberideen",
    blogType: "Typ",
    blogIntent: "Suchabsicht",
    blogTitle: "Vorgeschlagener Titel",
    blogWhy: "Warum es passt",
    blogReader: "Leser",
    blogAnchor: "Interner Linktext",
    blogRisk: "Benötigte Belege",
    noOpportunity: "Keine Gelegenheit angegeben.",
    community: "Orte für vorsichtige Diskussion",
    communityTypes: "Community-Typen",
    redditSearches: "Reddit-Suchen",
    bloggerSearches: "Blogger-Suchen",
    facebookSearches: "Facebook-Gruppensuchen",
    postAngle: "Beitragsidee",
    replyAngle: "Antwortidee",
    executable: "Nach Freigabe direkt änderbar",
    noExecutable: "Keine sichere Änderung empfohlen.",
    labelNote: "Hinweis",
    generated: "Erstellt",
    reviewed: "Geprüft",
  },
};

function normalizeLanguage(input = {}) {
  const raw = String(input.language || input.locale || input.userLanguage || "").toLowerCase();
  if (raw.startsWith("zh") || /中文|chinese|简体|繁体/.test(raw)) return "zh";
  if (raw.startsWith("de") || /german|deutsch|德语/.test(raw)) return "de";
  return "en";
}

function getCopy(input = {}) {
  return REPORT_COPY[normalizeLanguage(input)] || REPORT_COPY.en;
}

function sourceLabel(source, copy) {
  if (source === "shopify_title_fallback") return copy.fallbackTitle;
  if (source === "shopify_description_fallback") return copy.fallbackDescription;
  return copy.explicitField;
}

function normalizeReportProduct(product) {
  const resolvedSeo = resolvedSeoFields(product);
  return {
    ...product,
    currentSeoTitle: product.currentSeoTitle || resolvedSeo.title,
    currentMetaDescription: product.currentMetaDescription || resolvedSeo.description,
    currentSeoTitleSource: product.currentSeoTitleSource || product.seoTitleSource || resolvedSeo.titleSource,
    currentMetaDescriptionSource: product.currentMetaDescriptionSource || product.seoDescriptionSource || resolvedSeo.descriptionSource,
  };
}

function averageScore(products) {
  const scores = products
    .map((product) => Number(product.serpScore ?? product.score))
    .filter((value) => Number.isFinite(value));
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function estimatedLift(products, average) {
  const explicit = products
    .map((product) => Number(product.expectedLiftPercent ?? product.estimatedLiftPercent))
    .filter((value) => Number.isFinite(value));
  if (explicit.length) return Math.round(explicit.reduce((sum, value) => sum + value, 0) / explicit.length);
  const current = Number(average);
  if (!Number.isFinite(current)) return null;
  return Math.max(0, Math.min(35, Math.round((85 - current) * 0.45)));
}

function list(items, empty = "No item provided.") {
  const values = plainArray(items);
  if (!values.length) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<ul class="clean-list">${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function displayValue(raw) {
  if (Array.isArray(raw)) return raw.filter((item) => item !== null && item !== undefined && String(item).trim() !== "").join(" | ");
  return String(raw ?? "");
}

function keyValues(items, empty = "No details provided.", copy = REPORT_COPY.en) {
  const values = plainArray(items);
  if (!values.length) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<div class="kv-list">${values.map((item) => {
    if (typeof item === "string") return `<div><dt>${escapeHtml(copy.labelNote)}</dt><dd>${escapeHtml(item)}</dd></div>`;
    const key = item.label || item.key || item.question || item.layer || item.type || "Item";
    const value = item.value || item.recommendation || item.query || item.fit || item.targetIntent || item.description || item.title || "";
    const extra = item.risk || item.evidence || item.notes || "";
    return `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}${extra ? `<span>${escapeHtml(extra)}</span>` : ""}</dd></div>`;
  }).join("")}</div>`;
}

function cards(items, fields, copy = REPORT_COPY.en) {
  const values = plainArray(items);
  if (!values.length) return `<p class="muted">${escapeHtml(copy.noOpportunity)}</p>`;
  return `<div class="mini-grid">${values.map((item) => {
    const body = fields.map((field) => {
      const raw = item[field.key];
      if (raw === undefined || raw === null || raw === "") return "";
      return `<p><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(displayValue(raw))}</p>`;
    }).filter(Boolean).join("");
    return `<article class="mini-card">${body}</article>`;
  }).join("")}</div>`;
}

function renderEnhancedSnippets(enhanced = {}, copy = REPORT_COPY.en) {
  const sections = [
    {
      title: copy.enhancedFaq,
      items: enhanced.faq,
      fields: [
        { key: "question", label: copy.enhancedQuestion },
        { key: "answerDirection", label: copy.enhancedAnswerDirection },
        { key: "merchantEvidence", label: copy.enhancedMerchantEvidence },
        { key: "googleIntentEvidence", label: copy.enhancedGoogleEvidence },
        { key: "amazonIntentEvidence", label: copy.enhancedAmazonEvidence },
        { key: "risk", label: copy.blogRisk },
      ],
    },
    {
      title: copy.enhancedComparison,
      items: enhanced.comparison,
      fields: [
        { key: "comparisonType", label: copy.enhancedComparisonType },
        { key: "metrics", label: copy.enhancedMetrics },
        { key: "merchantEvidence", label: copy.enhancedMerchantEvidence },
        { key: "googleIntentEvidence", label: copy.enhancedGoogleEvidence },
        { key: "amazonIntentEvidence", label: copy.enhancedAmazonEvidence },
        { key: "risk", label: copy.blogRisk },
      ],
    },
    {
      title: copy.enhancedHowTo,
      items: enhanced.howTo,
      fields: [
        { key: "topic", label: copy.enhancedTopic },
        { key: "userGoal", label: copy.enhancedUserGoal },
        { key: "merchantEvidence", label: copy.enhancedMerchantEvidence },
        { key: "googleIntentEvidence", label: copy.enhancedGoogleEvidence },
        { key: "amazonIntentEvidence", label: copy.enhancedAmazonEvidence },
        { key: "risk", label: copy.blogRisk },
      ],
    },
    {
      title: copy.enhancedDetails,
      items: enhanced.detailsAndSpecs,
      fields: [
        { key: "attribute", label: copy.enhancedAttribute },
        { key: "whyItMatters", label: copy.enhancedWhyItMatters },
        { key: "merchantEvidence", label: copy.enhancedMerchantEvidence },
        { key: "googleIntentEvidence", label: copy.enhancedGoogleEvidence },
        { key: "amazonIntentEvidence", label: copy.enhancedAmazonEvidence },
        { key: "risk", label: copy.blogRisk },
      ],
    },
    {
      title: copy.enhancedFeatures,
      items: enhanced.features,
      fields: [
        { key: "feature", label: copy.enhancedFeature },
        { key: "buyerValue", label: copy.enhancedBuyerValue },
        { key: "merchantEvidence", label: copy.enhancedMerchantEvidence },
        { key: "googleIntentEvidence", label: copy.enhancedGoogleEvidence },
        { key: "amazonIntentEvidence", label: copy.enhancedAmazonEvidence },
        { key: "risk", label: copy.blogRisk },
      ],
    },
  ];
  const hasItems = sections.some((section) => plainArray(section.items).length);
  if (!hasItems && !enhanced.evidenceRule && !enhanced.eligibilityNote) {
    return `<p class="muted">${escapeHtml(copy.noOpportunity)}</p>`;
  }
  return `${enhanced.evidenceRule ? `<p><strong>${escapeHtml(copy.enhancedEvidenceRule)}:</strong> ${escapeHtml(enhanced.evidenceRule)}</p>` : ""}
${enhanced.eligibilityNote ? `<p><strong>${escapeHtml(copy.labelNote)}:</strong> ${escapeHtml(enhanced.eligibilityNote)}</p>` : ""}
${sections.map((section) => `<div class="mini-section"><h4>${escapeHtml(section.title)}</h4>${cards(section.items, section.fields, copy)}</div>`).join("")}`;
}

function renderMetafieldsAudit(audit = {}, copy = REPORT_COPY.en) {
  const modules = plainArray(audit.modules).map((item) => `${item.name}: ${item.count}`);
  return `
<div class="mini-section">
  <h4>${escapeHtml(copy.metafieldsModules)}</h4>
  ${list(modules, copy.noOpportunity)}
</div>
<div class="mini-section">
  <h4>${escapeHtml(copy.metafieldsPopulated)}</h4>
  ${cards(audit.populatedDefinitions, [
    { key: "module", label: copy.metafieldsModule },
    { key: "name", label: copy.labelNote },
    { key: "namespace", label: copy.metafieldsNamespace },
    { key: "key", label: copy.metafieldsKey },
    { key: "type", label: copy.metafieldsType },
    { key: "valuePreview", label: copy.metafieldsValue },
  ], copy)}
</div>
<div class="mini-section">
  <h4>${escapeHtml(copy.metafieldsMissing)}</h4>
  ${cards(audit.missingDefinitions, [
    { key: "module", label: copy.metafieldsModule },
    { key: "name", label: copy.labelNote },
    { key: "namespace", label: copy.metafieldsNamespace },
    { key: "key", label: copy.metafieldsKey },
    { key: "type", label: copy.metafieldsType },
    { key: "description", label: copy.enhancedWhyItMatters },
  ], copy)}
</div>
<div class="mini-section">
  <h4>${escapeHtml(copy.metafieldsValueOnly)}</h4>
  ${cards(audit.valueOnlyMetafields, [
    { key: "module", label: copy.metafieldsModule },
    { key: "namespace", label: copy.metafieldsNamespace },
    { key: "key", label: copy.metafieldsKey },
    { key: "type", label: copy.metafieldsType },
    { key: "valuePreview", label: copy.metafieldsValue },
  ], copy)}
</div>`;
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

function renderCommunity(community = {}, copy = REPORT_COPY.en) {
  const redditSearches = plainArray(community.redditSearches);
  const bloggerSearches = plainArray(community.bloggerSearches);
  const facebookSearches = plainArray(community.facebookGroupSearches);
  return `<div class="community-grid">
    <div><h4>${escapeHtml(copy.communityTypes)}</h4>${list(community.subredditTypes || community.communityTypes, copy.noOpportunity)}</div>
    <div><h4>${escapeHtml(copy.redditSearches)}</h4>${list(redditSearches, copy.noOpportunity)}</div>
    <div><h4>${escapeHtml(copy.bloggerSearches)}</h4>${list(bloggerSearches, copy.noOpportunity)}</div>
    <div><h4>${escapeHtml(copy.facebookSearches)}</h4>${list(facebookSearches, copy.noOpportunity)}</div>
    <div><h4>${escapeHtml(copy.postAngle)}</h4><p>${escapeHtml(community.postAngle || copy.noOpportunity)}</p></div>
    <div><h4>${escapeHtml(copy.replyAngle)}</h4><p>${escapeHtml(community.replyAngle || copy.noOpportunity)}</p></div>
  </div>`;
}

function renderProduct(rawProduct, index, copy = REPORT_COPY.en) {
  const product = normalizeReportProduct(rawProduct);
  const score = product.serpScore ?? product.score ?? "N/A";
  const currentProductTitle = product.currentProductTitle || product.title || "";
  const currentProductDescription = firstText(product.currentProductDescription || product.descriptionHtml || product.description || "", 320);
  const recommendedProductTitle = product.recommendedProductTitle || product.productTitleRecommendation || "";
  const recommendedProductDescription = firstText(product.recommendedProductDescription || product.recommendedDescriptionHtml || "", 320);
  return `<section class="product-page">
    <div class="product-hero">
      <p class="eyebrow">${escapeHtml(copy.productPage)} ${index + 1}</p>
      <h2>${escapeHtml(product.title || "Untitled product")}</h2>
      <p>${escapeHtml(product.url || product.handle || "")}</p>
    </div>
    <div class="bento">
      <article class="card score-card">
        <h3>🎯 ${escapeHtml(copy.score)}</h3>
        <p class="score">${escapeHtml(score)}</p>
        <p>${escapeHtml(product.scoreSummary || copy.scoreSummary)}</p>
      </article>
      <article class="card wide current-card">
        <h3>📝 ${escapeHtml(copy.currentProductCopy)}</h3>
        <div class="snippet">
          <strong>${escapeHtml(copy.productTitle)}</strong>
          <p>${escapeHtml(currentProductTitle || copy.noOpportunity)}</p>
        </div>
        <div class="snippet">
          <strong>${escapeHtml(copy.productDescription)}</strong>
          <p>${escapeHtml(currentProductDescription || copy.noOpportunity)}</p>
        </div>
      </article>
      <article class="card wide recommend">
        <h3>✏️ ${escapeHtml(copy.recommendedProductCopy)}</h3>
        <div class="snippet">
          <strong>${escapeHtml(copy.productTitle)}</strong>
          <p>${escapeHtml(recommendedProductTitle || copy.noOpportunity)}</p>
        </div>
        <div class="snippet">
          <strong>${escapeHtml(copy.productDescription)}</strong>
          <p>${escapeHtml(recommendedProductDescription || copy.noOpportunity)}</p>
        </div>
      </article>
      <article class="card wide current-card">
        <h3>🔎 ${escapeHtml(copy.currentSnippet)}</h3>
        <div class="snippet">
          <strong>${escapeHtml(copy.seoTitle)}</strong>
          <p>${escapeHtml(product.currentSeoTitle || "")}</p>
          <small>${escapeHtml(sourceLabel(product.currentSeoTitleSource, copy))}</small>
        </div>
        <div class="snippet">
          <strong>${escapeHtml(copy.metaDescription)}</strong>
          <p>${escapeHtml(product.currentMetaDescription || "")}</p>
          <small>${escapeHtml(sourceLabel(product.currentMetaDescriptionSource, copy))}</small>
        </div>
      </article>
      <article class="card wide recommend">
        <h3>✍️ ${escapeHtml(copy.recommendedSnippet)}</h3>
        <div class="snippet">
          <strong>${escapeHtml(copy.seoTitle)}</strong>
          <p>${escapeHtml(product.recommendedSeoTitle || "No title change recommended.")}</p>
        </div>
        <div class="snippet">
          <strong>${escapeHtml(copy.metaDescription)}</strong>
          <p>${escapeHtml(product.recommendedMetaDescription || "No meta description change recommended.")}</p>
        </div>
      </article>
      <article class="card">
        <h3>📌 ${escapeHtml(copy.evidence)}</h3>
        ${list(product.evidence, copy.evidenceEmpty)}
      </article>
      <article class="card">
        <h3>🪜 ${escapeHtml(copy.microIntent)}</h3>
        ${keyValues(product.microIntents, copy.microIntentEmpty, copy)}
      </article>
      <article class="card wide">
        <h3>🧠 ${escapeHtml(copy.contentGaps)}</h3>
        ${keyValues(product.contentGaps, copy.contentGapsEmpty, copy)}
      </article>
      <article class="card wide">
        <h3>🧬 ${escapeHtml(copy.metafieldsAudit)}</h3>
        ${renderMetafieldsAudit(product.metafieldsAudit, copy)}
      </article>
      <article class="card wide">
        <h3>🧩 ${escapeHtml(copy.enhancedSnippets)}</h3>
        ${renderEnhancedSnippets(product.enhancedSnippets, copy)}
      </article>
      <article class="card wide">
        <h3>📰 ${escapeHtml(copy.blogMap)}</h3>
        ${cards(product.blogTopics, [
          { key: "type", label: copy.blogType },
          { key: "targetIntent", label: copy.blogIntent },
          { key: "suggestedTitle", label: copy.blogTitle },
          { key: "whyProductSupportsIt", label: copy.blogWhy },
          { key: "targetReader", label: copy.blogReader },
          { key: "internalLinkAnchor", label: copy.blogAnchor },
          { key: "risk", label: copy.blogRisk },
        ], copy)}
      </article>
      <article class="card wide community-card">
        <h3>🌐 ${escapeHtml(copy.community)}</h3>
        ${renderCommunity(product.community, copy)}
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
  const copy = getCopy(input);
  const generatedAt = input.generatedAt || new Date().toISOString();
  const products = plainArray(input.products).map(normalizeReportProduct);
  const output = args.output || `shopify-serp-report-${reportTimestamp()}.html`;
  const title = input.title || copy.reportTitle;
  const avgScore = input.averageSeoScore ?? input.averageScore ?? averageScore(products);
  const lift = input.expectedLiftPercent ?? input.estimatedLiftPercent ?? estimatedLift(products, avgScore);
  const takeaways = input.summaryBullets || input.keyTakeaways || input.takeaways || products.slice(0, 3).map((product) => {
    const name = product.title || product.handle || "Product";
    const score = product.serpScore ?? product.score;
    return score ? `${name}: ${copy.score} ${score}` : name;
  });
  const overview = `<section class="cover">
    <div class="cover-heading">
      <p class="eyebrow">${escapeHtml(copy.coverEyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lead">${escapeHtml(input.summary || copy.coverLead)}</p>
    </div>
    <div class="cover-grid">
      <article class="metric-card store-card"><span>${escapeHtml(copy.store)}</span><strong>${escapeHtml(input.store?.name || input.store?.domain || "Unknown store")}</strong><small>${escapeHtml(input.store?.domain || "")}</small></article>
      <article class="metric-card"><span>${escapeHtml(copy.totalProducts)}</span><strong>${escapeHtml(input.productCount ?? input.scannedProductCount ?? products.length)}</strong><small>${escapeHtml(copy.generated)} ${escapeHtml(generatedAt)}</small></article>
      <article class="metric-card"><span>${escapeHtml(copy.auditedProducts)}</span><strong>${escapeHtml(input.auditedProductCount ?? products.length)}</strong><small>${escapeHtml(copy.reviewed)}</small></article>
      <article class="metric-card score-metric"><span>${escapeHtml(copy.averageScore)}</span><strong>${avgScore === null || avgScore === undefined ? "N/A" : `${escapeHtml(avgScore)}/100`}</strong><small>${escapeHtml(copy.scoreNote)}</small></article>
      <article class="metric-card lift-metric"><span>${escapeHtml(copy.estimatedLift)}</span><strong>${lift === null || lift === undefined ? "N/A" : `+${escapeHtml(lift)}%`}</strong><small>${escapeHtml(copy.scoreNote)}</small></article>
    </div>
    <div class="summary-panel">
      <h2>📍 ${escapeHtml(copy.topTakeaways)}</h2>
      ${list(takeaways, copy.noTakeaways)}
    </div>
  </section>`;
  const productSections = products.map((product, index) => renderProduct(product, index, copy)).join("\n");
  const html = template
    .replaceAll("{{REPORT_TITLE}}", escapeHtml(title))
    .replaceAll("{{REPORT_LANG}}", escapeHtml(copy.lang))
    .replaceAll("{{EXPORT_PDF_LABEL}}", escapeHtml(copy.exportPdf))
    .replaceAll("{{GENERATED_AT}}", escapeHtml(generatedAt))
    .replace("{{REPORT_CONTENT}}", `${overview}\n${productSections}`);
  assertReportTemplateCompliance(template, html);
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

  for (const change of changes.filter((item) => item.type === "product_full_bundle")) {
    const current = await gql(client, PRODUCT_UPDATE_READ_QUERY, { identifier: { id: change.productId } });
    if (!current.product) fail(`Could not load current product for ${change.productId}`);
    const product = {
      id: change.productId,
      handle: current.product.handle,
    };
    if (change.productTitle) product.title = String(change.productTitle);
    if (change.descriptionHtml !== undefined) product.descriptionHtml = String(change.descriptionHtml);
    if (change.seoTitle || change.seoDescription) {
      product.seo = {};
      if (change.seoTitle) product.seo.title = String(change.seoTitle);
      if (change.seoDescription) product.seo.description = String(change.seoDescription);
    }
    if (product.title || product.descriptionHtml !== undefined || product.seo) {
      const data = await gql(
        client,
        `mutation SerpOptimizerProductBundleUpdate($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product { id title handle descriptionHtml seo { title description } }
            userErrors { field message }
          }
        }`,
        { product },
      );
      results.push({ type: "product_full_bundle", productId: change.productId, response: data.productUpdate });
    }
  }

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
    .map((item) => ({ id: item.id, alt: String(item.alt) }))
    .concat(changes.filter((item) => item.type === "product_full_bundle").flatMap(bundleAltUpdates));
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

  const metafieldUpdates = changes
    .filter((item) => item.type === "product_metafield")
    .map((item) => ({
      ownerId: item.productId,
      namespace: item.namespace,
      key: item.key,
      type: item.type,
      value: String(item.value),
    }))
    .concat(changes.filter((item) => item.type === "product_full_bundle").flatMap(bundleMetafieldUpdates));
  if (metafieldUpdates.length) {
    const data = await gql(
      client,
      `mutation SerpOptimizerMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value type }
          userErrors { field message code }
        }
      }`,
      { metafields: metafieldUpdates },
    );
    results.push({ type: "product_metafield", response: data.metafieldsSet });
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
  if (command === "metafield-audit") return metafieldAuditCommand(args);
  if (command === "scan-products") return scanProducts(args);
  if (command === "batch-plan") return batchPlan(args);
  if (command === "report") return reportCommand(args);
  if (command === "apply") return applyCommand(args);
  fail(`Unknown command: ${command || "(missing)"}`);
}

main().catch((error) => fail(error.stack || error.message));
