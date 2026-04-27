#!/usr/bin/env node

import { readFile } from "node:fs/promises";

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
  const text = await readFile(path, "utf8");
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
    SHOPIFY_CLIENT_SECRET: env.SKILL_HUB_SHOPIFY_CLIENT_SECRET || env.SHOPIFY_CLIENT_SECRET,
    SHOPIFY_API_VERSION: env.SKILL_HUB_SHOPIFY_API_VERSION || env.SHOPIFY_API_VERSION,
  };

  env.SHOPIFY_STORE_DOMAIN = aliases.SHOPIFY_STORE_DOMAIN;
  env.SHOPIFY_ADMIN_API_ACCESS_TOKEN = aliases.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  env.SHOPIFY_CLIENT_ID = aliases.SHOPIFY_CLIENT_ID;
  env.SHOPIFY_CLIENT_SECRET = aliases.SHOPIFY_CLIENT_SECRET;

  if (!env.SHOPIFY_STORE_DOMAIN) throw new Error(`Missing SHOPIFY_STORE_DOMAIN in ${path}.`);

  env.SHOPIFY_STORE_DOMAIN = normalizeDomain(env.SHOPIFY_STORE_DOMAIN);

  if (!env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
      throw new Error(
        `Missing Shopify credentials in ${path}. Provide either SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN or both SKILL_HUB_SHOPIFY_CLIENT_ID and SKILL_HUB_SHOPIFY_CLIENT_SECRET.`,
      );
    }
    env.SHOPIFY_ADMIN_API_ACCESS_TOKEN = await getClientCredentialsToken(env);
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

async function getClientCredentialsToken(env) {
  if (!env.SHOPIFY_STORE_DOMAIN.endsWith(".myshopify.com")) {
    throw new Error("Dev Dashboard client credentials require SKILL_HUB_SHOPIFY_STORE_DOMAIN to be the store's .myshopify.com domain.");
  }

  const response = await fetch(`https://${env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SHOPIFY_CLIENT_ID,
      client_secret: env.SHOPIFY_CLIENT_SECRET,
    }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.access_token) {
    throw new Error(
      `Could not get a Dev Dashboard access token. Check the store domain, client ID, client secret, installation, and approved scopes. HTTP ${response.status}.`,
    );
  }

  return json.access_token;
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
