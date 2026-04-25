#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    command: argv[0],
    env: "skill-hub.env",
    input: null,
    articleId: null,
    productPageSize: 50,
    execute: false,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--env") {
      args.env = value;
      i += 1;
    } else if (key === "--input") {
      args.input = value;
      i += 1;
    } else if (key === "--article-id") {
      args.articleId = value;
      i += 1;
    } else if (key === "--product-page-size") {
      args.productPageSize = Number(value);
      i += 1;
    } else if (key === "--execute") {
      args.execute = true;
    }
  }

  if (!["context", "upload-images", "create-draft", "verify"].includes(args.command)) {
    throw new Error(
      "Usage: node shopify-blog-admin.mjs <context|upload-images|create-draft|verify> [--env skill-hub.env] [--input file.json] [--execute]",
    );
  }

  return args;
}

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

function normalizeDomain(value) {
  const raw = value.trim();
  const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
  return url.host;
}

async function loadEnv(envPath) {
  const env = parseEnv(await readFile(envPath, "utf8"));
  env.SHOPIFY_STORE_DOMAIN =
    env.SKILL_HUB_SHOPIFY_STORE_DOMAIN ||
    env.SHOPIFY_STORE_DOMAIN ||
    env.SHOPIFY_TEST_STORE_DOMAIN;
  env.SHOPIFY_ADMIN_API_ACCESS_TOKEN =
    env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN ||
    env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  env.SHOPIFY_API_VERSION = env.SKILL_HUB_SHOPIFY_API_VERSION || env.SHOPIFY_API_VERSION || "2026-04";

  for (const name of ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_API_ACCESS_TOKEN"]) {
    if (!env[name]) throw new Error(`Missing ${name} in ${envPath}.`);
  }

  env.SHOPIFY_STORE_DOMAIN = normalizeDomain(env.SHOPIFY_STORE_DOMAIN);
  env.SHOPIFY_API_DOMAIN = await resolveAdminApiDomain(env);
  return env;
}

async function resolveAdminApiDomain(env) {
  if (env.SHOPIFY_STORE_DOMAIN.endsWith(".myshopify.com")) return env.SHOPIFY_STORE_DOMAIN;

  const endpoint = `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
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
    if (location) {
      const host = new URL(location, endpoint).host;
      if (host.endsWith(".myshopify.com")) return host;
    }
  }

  throw new Error("Could not resolve the Shopify Admin API host from the provided store domain.");
}

async function graphql(env, query, variables = {}) {
  const endpoint = `https://${env.SHOPIFY_API_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
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

const CONTEXT_QUERY = `#graphql
query BrandVoiceOverview($blogFirst: Int!, $articleFirst: Int!, $productFirst: Int!, $after: String) {
  shop { name description myshopifyDomain primaryDomain { host url } }
  blogs(first: $blogFirst) { nodes { id title handle } }
  articles(first: $articleFirst, sortKey: PUBLISHED_AT, reverse: true) {
    nodes { id title handle summary publishedAt author { name } blog { id title handle } }
  }
  products(first: $productFirst, after: $after, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id title handle description productType vendor onlineStoreUrl
      featuredMedia { preview { image { url altText width height } } }
      media(first: 5) {
        nodes {
          alt mediaContentType
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

const STAGED_UPLOADS_CREATE = `#graphql
mutation StageImages($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`;

const FILE_CREATE = `#graphql
mutation CreateFiles($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      id alt fileStatus createdAt
      ... on MediaImage { image { url altText width height } }
    }
    userErrors { field message }
  }
}`;

const ARTICLE_CREATE = `#graphql
mutation CreateArticle($article: ArticleCreateInput!) {
  articleCreate(article: $article) {
    article { id title handle isPublished publishedAt author { name } }
    userErrors { code field message }
  }
}`;

const ARTICLE_VERIFY = `#graphql
query VerifyArticle($id: ID!) {
  article(id: $id) {
    id title handle body summary isPublished publishedAt
    author { name }
    image { altText originalSrc url }
    metafields(first: 20) { nodes { namespace key type value } }
  }
}`;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assertNoUserErrors(label, userErrors = []) {
  if (userErrors.length) throw new Error(`${label}: ${JSON.stringify(userErrors, null, 2)}`);
}

async function commandContext(env, args) {
  const products = [];
  let after = null;
  while (true) {
    const data = await graphql(env, CONTEXT_QUERY, {
      blogFirst: 50,
      articleFirst: 10,
      productFirst: args.productPageSize,
      after,
    });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) {
      console.log(JSON.stringify({ shop: data.shop, blogs: data.blogs.nodes, recentArticles: data.articles.nodes, products }, null, 2));
      return;
    }
    after = data.products.pageInfo.endCursor;
  }
}

async function commandUploadImages(env, args) {
  if (!args.input) throw new Error("upload-images requires --input manifest.json");
  const manifest = await readJson(args.input);
  const images = Array.isArray(manifest) ? manifest : manifest.images;
  if (!Array.isArray(images) || images.length === 0) throw new Error("Image manifest must be an array or { images: [...] }.");

  if (!args.execute) {
    console.log(JSON.stringify({ previewOnly: true, imageCount: images.length, filenames: images.map((image) => image.filename) }, null, 2));
    return;
  }

  const staged = await graphql(env, STAGED_UPLOADS_CREATE, {
    input: images.map((image) => ({
      filename: image.filename || path.basename(image.path),
      mimeType: image.mimeType,
      resource: "IMAGE",
      httpMethod: "POST",
    })),
  });
  assertNoUserErrors("stagedUploadsCreate", staged.stagedUploadsCreate.userErrors);

  for (let i = 0; i < images.length; i += 1) {
    const target = staged.stagedUploadsCreate.stagedTargets[i];
    const image = images[i];
    const bytes = await readFile(image.path);
    const form = new FormData();
    for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
    form.append("file", new Blob([bytes], { type: image.mimeType }), image.filename || path.basename(image.path));
    const upload = await fetch(target.url, { method: "POST", body: form });
    if (!upload.ok) throw new Error(`Upload failed for ${image.path}: HTTP ${upload.status}`);
    image.originalSource = target.resourceUrl;
  }

  const created = await graphql(env, FILE_CREATE, {
    files: images.map((image) => ({
      originalSource: image.originalSource,
      contentType: "IMAGE",
      alt: image.alt || "",
      filename: image.filename || path.basename(image.path),
    })),
  });
  assertNoUserErrors("fileCreate", created.fileCreate.userErrors);
  console.log(JSON.stringify(created.fileCreate.files, null, 2));
}

async function commandCreateDraft(env, args) {
  if (!args.input) throw new Error("create-draft requires --input draft.json");
  const draft = await readJson(args.input);
  if (!draft.blogId || !draft.title || !draft.body) throw new Error("Draft JSON must include blogId, title, and body.");

  const article = {
    blogId: draft.blogId,
    title: draft.title,
    author: draft.author,
    summary: draft.summary,
    body: draft.body,
    image: draft.image,
    metafields: draft.metafields,
    isPublished: false,
  };

  if (!args.execute) {
    console.log(JSON.stringify({ previewOnly: true, article }, null, 2));
    return;
  }

  const created = await graphql(env, ARTICLE_CREATE, { article });
  assertNoUserErrors("articleCreate", created.articleCreate.userErrors);
  console.log(JSON.stringify(created.articleCreate.article, null, 2));
}

async function commandVerify(env, args) {
  if (!args.articleId) throw new Error("verify requires --article-id gid://shopify/Article/...");
  const data = await graphql(env, ARTICLE_VERIFY, { id: args.articleId });
  console.log(JSON.stringify(data.article, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await loadEnv(args.env);
  if (args.command === "context") await commandContext(env, args);
  if (args.command === "upload-images") await commandUploadImages(env, args);
  if (args.command === "create-draft") await commandCreateDraft(env, args);
  if (args.command === "verify") await commandVerify(env, args);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
