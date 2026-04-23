#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = {
    env: ".skill-hub/skill-hub.env",
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
    SHOPIFY_STORE_DOMAIN: env.SKILL_HUB_SHOPIFY_STORE_DOMAIN || env.SHOPIFY_STORE_DOMAIN,
    SHOPIFY_ADMIN_API_ACCESS_TOKEN:
      env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN || env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    SHOPIFY_API_VERSION: env.SKILL_HUB_SHOPIFY_API_VERSION || env.SHOPIFY_API_VERSION || "2026-04",
  };

  for (const name of ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_API_ACCESS_TOKEN"]) {
    env[name] = aliases[name];
    if (!env[name]) throw new Error(`Missing ${name} in ${path}.`);
  }

  env.SHOPIFY_API_VERSION = aliases.SHOPIFY_API_VERSION;
  return env;
}

async function graphql(env, query, variables = {}) {
  const endpoint = `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

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
