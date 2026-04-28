#!/usr/bin/env node

import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const REQUIRED_SCOPES = "read_products,write_content,write_files";

function parseArgs(argv) {
  const args = {
    env: "skill-hub.env",
    articleId: null,
    productPageSize: 50,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--env") {
      args.env = value;
      i += 1;
    } else if (key === "--article-id") {
      args.articleId = value;
      i += 1;
    } else if (key === "--product-page-size") {
      args.productPageSize = Number(value);
      i += 1;
    }
  }

  if (!Number.isInteger(args.productPageSize) || args.productPageSize < 1 || args.productPageSize > 250) {
    throw new Error("--product-page-size must be an integer from 1 to 250.");
  }

  return args;
}

async function loadEnv(path) {
  const text = await readFile(path, "utf8").catch(() => null);
  if (!text) {
    throw new Error(`Missing env file: ${path}. Current working directory: ${process.cwd()}. The env must be in the user's working directory, not the installed skill directory. Run from the folder that contains skill-hub.env, or pass an absolute path such as --env "<USER_WORKDIR>\\skill-hub.env".`);
  }
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    env[name] = value;
  }

  const aliases = {
    SHOPIFY_STORE_DOMAIN:
      env.SKILL_HUB_SHOPIFY_STORE_DOMAIN || env.SHOPIFY_STORE_DOMAIN || env.SHOPIFY_TEST_STORE_DOMAIN,
    SHOPIFY_ADMIN_API_ACCESS_TOKEN:
      env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN || env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    SHOPIFY_CLIENT_ID: env.SKILL_HUB_SHOPIFY_CLIENT_ID || env.SHOPIFY_CLIENT_ID,
    SHOPIFY_API_VERSION: env.SKILL_HUB_SHOPIFY_API_VERSION || env.SHOPIFY_API_VERSION,
  };

  env.SHOPIFY_STORE_DOMAIN = aliases.SHOPIFY_STORE_DOMAIN;
  env.SHOPIFY_ADMIN_API_ACCESS_TOKEN = aliases.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  env.SHOPIFY_CLIENT_ID = aliases.SHOPIFY_CLIENT_ID;

  if (!env.SHOPIFY_STORE_DOMAIN) throw new Error(`Missing SHOPIFY_STORE_DOMAIN in ${path}.`);

  env.SHOPIFY_STORE_DOMAIN = normalizeDomain(env.SHOPIFY_STORE_DOMAIN);

  const accessMethod = env.SKILL_HUB_SHOPIFY_ACCESS_METHOD || (env.SHOPIFY_CLIENT_ID ? "dev_dashboard_app" : "admin_custom_app");

  if (accessMethod === "dev_dashboard_app") {
    if (!env.SHOPIFY_STORE_DOMAIN.endsWith(".myshopify.com")) {
      throw new Error("Dev Dashboard app setup requires SKILL_HUB_SHOPIFY_STORE_DOMAIN to be the store's .myshopify.com domain.");
    }
    env.SHOPIFY_API_DOMAIN = env.SHOPIFY_STORE_DOMAIN;
    env.SHOPIFY_API_VERSION = "shopify-cli";
    env.SHOPIFY_TRANSPORT = "shopify_cli";
    return env;
  }

  if (!env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    throw new Error(`Missing SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN in ${path} for admin_custom_app.`);
  }

  const endpoint = await resolveAdminEndpoint(env, aliases.SHOPIFY_API_VERSION);
  env.SHOPIFY_API_DOMAIN = endpoint.host;
  env.SHOPIFY_API_VERSION = endpoint.version;
  return env;
}

function normalizeDomain(value) {
  const raw = value.trim();
  const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
  return url.host;
}

function candidateApiVersions(preferredVersion) {
  const versions = [];
  if (preferredVersion) versions.push(preferredVersion);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const quarterMonth = [1, 4, 7, 10].filter((value) => value <= month).pop() || 1;

  for (let offset = 0; offset < 8; offset += 1) {
    const quarterIndex = [1, 4, 7, 10].indexOf(quarterMonth) - offset;
    const candidateYear = year + Math.floor(quarterIndex / 4);
    const candidateMonth = [1, 4, 7, 10][((quarterIndex % 4) + 4) % 4];
    versions.push(`${candidateYear}-${String(candidateMonth).padStart(2, "0")}`);
  }

  return [...new Set(versions)];
}

async function probeAdminEndpoint(host, version, token, redirect = "follow") {
  const endpoint = `https://${host}/admin/api/${version}/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    redirect,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query: "query SkillHubVersionProbe { shop { myshopifyDomain } }" }),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {}

  return {
    ok: response.ok && !json?.errors,
    status: response.status,
    location: response.headers.get("location"),
    version: response.headers.get("x-shopify-api-version") || version,
  };
}

async function resolveAdminEndpoint(env, preferredVersion) {
  const host = env.SHOPIFY_STORE_DOMAIN;
  const versions = candidateApiVersions(preferredVersion);

  for (const version of versions) {
    if (host.endsWith(".myshopify.com")) {
      const probe = await probeAdminEndpoint(host, version, env.SHOPIFY_ADMIN_API_ACCESS_TOKEN);
      if (probe.ok) return { host, version: probe.version };
      continue;
    }

    const endpoint = `https://${host}/admin/api/${version}/graphql.json`;
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: "query SkillHubDomainProbe { shop { myshopifyDomain } }" }),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.arrayBuffer().catch(() => {});
      if (!location) continue;
      const redirectedHost = new URL(location, endpoint).host;
      if (!redirectedHost.endsWith(".myshopify.com")) continue;
      const probe = await probeAdminEndpoint(redirectedHost, version, env.SHOPIFY_ADMIN_API_ACCESS_TOKEN);
      if (probe.ok) return { host: redirectedHost, version: probe.version };
    } else if (response.ok) {
      const versionHeader = response.headers.get("x-shopify-api-version");
      return { host, version: versionHeader || version };
    }
  }

  throw new Error(
    "Could not resolve a usable Shopify Admin API endpoint from SHOPIFY_STORE_DOMAIN. Check the store domain and Admin API token.",
  );
}

async function graphql(env, query, variables = {}) {
  if (env.SHOPIFY_TRANSPORT === "shopify_cli") {
    return shopifyCliGraphql(env, query, variables);
  }

  const endpoint = `https://${env.SHOPIFY_API_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new Error(`Shopify Admin API request failed for resolved domain ${env.SHOPIFY_API_DOMAIN}: ${error.message}`);
  }

  const json = await response.json();
  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify({ status: response.status, errors: json.errors }, null, 2));
  }
  return json.data;
}

async function pathExists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

async function resolveShopifyCliJs(env = {}) {
  const candidates = [];
  if (env.SKILL_HUB_SHOPIFY_CLI_JS || process.env.SKILL_HUB_SHOPIFY_CLI_JS) {
    candidates.push(env.SKILL_HUB_SHOPIFY_CLI_JS || process.env.SKILL_HUB_SHOPIFY_CLI_JS);
  }
  const npmRoot = await execFileAsync("npm", ["root", "-g"], { windowsHide: true })
    .then(({ stdout }) => stdout.trim())
    .catch(() => "");
  if (npmRoot) candidates.push(path.join(npmRoot, "@shopify", "cli", "bin", "run.js"));
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules", "@shopify", "cli", "bin", "run.js"));
  for (const candidate of candidates) {
    if (candidate && await pathExists(candidate)) return candidate;
  }
  const error = new Error(`CLI_NOT_FOUND: Could not locate Shopify CLI JS entrypoint. Set SKILL_HUB_SHOPIFY_CLI_JS to @shopify/cli/bin/run.js.`);
  error.code = "CLI_NOT_FOUND";
  throw error;
}

function normalizeCliJson(raw) {
  if (raw?.errors) return { errors: raw.errors };
  return raw?.data ? raw : { data: raw };
}

function classifyCliError(error, detail = "") {
  const text = `${detail}\n${error?.message || ""}`;
  if (error?.code === "CLI_NOT_FOUND") return { code: "CLI_NOT_FOUND", message: error.message };
  if (error?.code === "ENOENT" || error?.code === "EINVAL" || error?.code === "EFTYPE") return { code: "CLI_SPAWN_FAILED", message: error.message };
  if (/access denied|denied access/i.test(text)) return { code: "CLI_ACCESS_DENIED", message: text.trim() };
  if (/store auth|stored store auth|auth.*required|not authenticated|login/i.test(text)) return { code: "CLI_AUTH_REQUIRED", message: text.trim() };
  return { code: "CLI_SPAWN_FAILED", message: text.trim() || "Shopify CLI request failed." };
}

async function shopifyCliGraphql(env, query, variables = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "skill-hub-shopify-cli-"));
  const queryFile = path.join(tempDir, "query.graphql");
  const variableFile = path.join(tempDir, "variables.json");
  const outputFile = path.join(tempDir, "output.json");
  try {
    const cliJs = await resolveShopifyCliJs(env);
    await writeFile(queryFile, query, "utf8");
    await writeFile(variableFile, JSON.stringify(variables || {}), "utf8");
    const args = [cliJs, "store", "execute", "--store", env.SHOPIFY_API_DOMAIN, "--query-file", queryFile, "--variable-file", variableFile, "--output-file", outputFile, "--json", "--no-color"];
    if (/(^|\n)\s*mutation\b/i.test(query)) args.push("--allow-mutations");
    const execResult = await execFileAsync(process.execPath, args, { timeout: 180000, maxBuffer: 1024 * 1024 * 20, windowsHide: true })
      .catch((error) => ({ cliError: classifyCliError(error, [error.stderr, error.stdout].filter(Boolean).map(String).join("\n")) }));
    if (execResult.cliError) throw new Error(`${execResult.cliError.code}: ${execResult.cliError.message}`);
    if (!await pathExists(outputFile)) throw new Error("CLI_OUTPUT_MISSING: Shopify CLI did not create output JSON.");
    let json;
    try {
      json = normalizeCliJson(JSON.parse(await readFile(outputFile, "utf8")));
    } catch (error) {
      throw new Error(`CLI_JSON_PARSE_FAILED: ${error.message}`);
    }
    if (json.errors) throw new Error(`CLI_GRAPHQL_ERRORS: ${JSON.stringify(json.errors)}`);
    return json.data;
  } catch (error) {
    throw new Error(`${error.message}\nIf this is CLI_AUTH_REQUIRED, run: shopify store auth --store ${env.SHOPIFY_API_DOMAIN} --scopes ${REQUIRED_SCOPES} --json --no-color`);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function fetchHomepageMeta(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return { url, ok: false, status: response.status };
    const html = await response.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
    const description =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1]?.trim() ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i)?.[1]?.trim() ||
      "";
    return { url, ok: true, title, description };
  } catch (error) {
    return { url, ok: false, error: error.message };
  }
}

const OVERVIEW_QUERY = `#graphql
query BrandVoiceOverview($blogFirst: Int!, $articleFirst: Int!, $articleId: ID!, $includeArticle: Boolean!) {
  shop {
    name
    description
    myshopifyDomain
    primaryDomain { host url }
  }
  blogs(first: $blogFirst) {
    nodes { id title handle }
  }
  articles(first: $articleFirst, sortKey: PUBLISHED_AT, reverse: true) {
    nodes {
      id
      title
      handle
      summary
      publishedAt
      author { name }
      blog { id title handle }
    }
  }
  article(id: $articleId) @include(if: $includeArticle) {
    id
    title
    handle
    body
    summary
    publishedAt
    author { name }
    image { altText url }
    blog { id title handle }
  }
}`;

const PRODUCTS_QUERY = `#graphql
query ProductPage($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id
      title
      handle
      description
      productType
      vendor
      status
      tags
      seo { title description }
      collections(first: 5) { nodes { id title handle } }
      onlineStoreUrl
      featuredMedia {
        preview { image { url altText width height } }
      }
      media(first: 5) {
        nodes {
          alt
          mediaContentType
          preview { image { url altText width height } }
          ... on MediaImage { image { url altText width height } }
        }
      }
      priceRangeV2 {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await loadEnv(args.env);

  const overview = await graphql(env, OVERVIEW_QUERY, {
    blogFirst: 50,
    articleFirst: 10,
    articleId: args.articleId || "gid://shopify/Article/0",
    includeArticle: Boolean(args.articleId),
  });

  const products = [];
  let after = null;
  while (true) {
    const page = await graphql(env, PRODUCTS_QUERY, { first: args.productPageSize, after });
    products.push(...page.products.nodes);
    if (!page.products.pageInfo.hasNextPage) break;
    after = page.products.pageInfo.endCursor;
  }

  const homepageUrl =
    overview.shop.primaryDomain?.url ||
    (overview.shop.primaryDomain?.host ? `https://${overview.shop.primaryDomain.host}` : null);
  const homepageMeta = await fetchHomepageMeta(homepageUrl);

  console.log(
    JSON.stringify(
      {
        shop: overview.shop,
        homepageMeta,
        blogs: overview.blogs.nodes,
        recentArticles: overview.articles.nodes,
        products,
        article: args.articleId ? overview.article : null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
