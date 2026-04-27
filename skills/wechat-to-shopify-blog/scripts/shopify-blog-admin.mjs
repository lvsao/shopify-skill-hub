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
    requireImages: false,
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
    } else if (key === "--require-images") {
      args.requireImages = true;
    }
  }

  if (!["context", "upload-images", "create-draft", "update-draft", "verify"].includes(args.command)) {
    throw new Error(
      "Usage: node shopify-blog-admin.mjs <context|upload-images|create-draft|update-draft|verify> [--env skill-hub.env] [--input file.json] [--article-id gid://shopify/Article/...] [--execute] [--require-images]",
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
  env.SHOPIFY_CLIENT_ID = env.SKILL_HUB_SHOPIFY_CLIENT_ID || env.SHOPIFY_CLIENT_ID;
  env.SHOPIFY_CLIENT_SECRET = env.SKILL_HUB_SHOPIFY_CLIENT_SECRET || env.SHOPIFY_CLIENT_SECRET;
  const preferredVersion = env.SKILL_HUB_SHOPIFY_API_VERSION || env.SHOPIFY_API_VERSION;

  if (!env.SHOPIFY_STORE_DOMAIN) throw new Error(`Missing SHOPIFY_STORE_DOMAIN in ${envPath}.`);

  env.SHOPIFY_STORE_DOMAIN = normalizeDomain(env.SHOPIFY_STORE_DOMAIN);

  if (!env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
      throw new Error(
        `Missing Shopify credentials in ${envPath}. Provide either SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN or both SKILL_HUB_SHOPIFY_CLIENT_ID and SKILL_HUB_SHOPIFY_CLIENT_SECRET.`,
      );
    }
    env.SHOPIFY_ADMIN_API_ACCESS_TOKEN = await getClientCredentialsToken(env);
  }

  const endpoint = await resolveAdminEndpoint(env, preferredVersion);
  env.SHOPIFY_API_DOMAIN = endpoint.host;
  env.SHOPIFY_API_VERSION = endpoint.version;
  return env;
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

  throw new Error("Could not resolve a usable Shopify Admin API endpoint from the provided store domain and Admin API token.");
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
      id title handle description productType vendor status tags onlineStoreUrl
      seo { title description }
      collections(first: 5) { nodes { id title handle } }
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

const FILE_NODE = `#graphql
query FileNode($id: ID!) {
  node(id: $id) {
    id
    ... on MediaImage {
      fileStatus
      alt
      image { url altText width height }
    }
  }
}`;

const ARTICLE_CREATE = `#graphql
mutation CreateArticle($article: ArticleCreateInput!) {
  articleCreate(article: $article) {
    article { id title handle isPublished publishedAt author { name } }
    userErrors { code field message }
  }
}`;

const ARTICLE_UPDATE = `#graphql
mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) {
  articleUpdate(id: $id, article: $article) {
    article { id title handle isPublished publishedAt author { name } }
    userErrors { code field message }
  }
}`;

const ARTICLE_VERIFY = `#graphql
query VerifyArticle($id: ID!) {
  article(id: $id) {
    id title handle body summary isPublished publishedAt
    author { name }
    image { altText url }
    metafields(first: 20) { nodes { namespace key type value } }
  }
}`;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assertNoUserErrors(label, userErrors = []) {
  if (userErrors.length) throw new Error(`${label}: ${JSON.stringify(userErrors, null, 2)}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertDraftImages(draft) {
  const body = String(draft.body || "");
  const hasBodyImage = /<img\b/i.test(body) && /cdn\.shopify\.com/i.test(body);
  const hasCoverImage = Boolean(draft.image?.url && /cdn\.shopify\.com/i.test(draft.image.url));
  if (!hasBodyImage && !hasCoverImage) {
    throw new Error(
      "This draft has no Shopify CDN images. Upload images first and insert returned CDN URLs, or rerun without --require-images only if the user explicitly approved a text-only draft.",
    );
  }
}

async function pollMediaImage(env, fileId, attempts = 20) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const data = await graphql(env, FILE_NODE, { id: fileId });
    const node = data.node;
    if (node?.fileStatus === "READY" && node.image?.url) return node;
    if (node?.fileStatus === "FAILED") throw new Error(`Shopify file processing failed for ${fileId}.`);
    await sleep(Math.min(1000 * attempt, 5000));
  }
  throw new Error(`Timed out waiting for Shopify file to become READY: ${fileId}`);
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
  for (const image of images) {
    image.path ||= image.download?.filePath;
    image.filename ||= image.download?.filename || (image.path ? path.basename(image.path) : null);
    image.mimeType ||= image.download?.mimeType;
    if (!image.path || !image.filename || !image.mimeType) {
      throw new Error("Each image manifest item must include path, filename, and mimeType. fetch-wechat-article.mjs outputs shopifyUploadManifest for this.");
    }
  }

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
  const readyFiles = [];
  for (let i = 0; i < created.fileCreate.files.length; i += 1) {
    const file = created.fileCreate.files[i];
    const ready = await pollMediaImage(env, file.id);
    readyFiles.push({
      sourcePath: images[i].path,
      sourceUrl: images[i].sourceUrl,
      filename: images[i].filename,
      id: ready.id,
      alt: ready.alt,
      url: ready.image.url,
      width: ready.image.width,
      height: ready.image.height,
    });
  }
  console.log(JSON.stringify({ files: readyFiles }, null, 2));
}

async function commandCreateDraft(env, args) {
  if (!args.input) throw new Error("create-draft requires --input draft.json");
  const draft = await readJson(args.input);
  if (!draft.blogId || !draft.title || !draft.body) throw new Error("Draft JSON must include blogId, title, and body.");
  if (args.requireImages) assertDraftImages(draft);

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

async function commandUpdateDraft(env, args) {
  if (!args.articleId) throw new Error("update-draft requires --article-id gid://shopify/Article/...");
  if (!args.input) throw new Error("update-draft requires --input draft.json");
  const draft = await readJson(args.input);
  if (!draft.title && !draft.body && !draft.summary && !draft.image && !draft.metafields) {
    throw new Error("Draft JSON must include at least one article field to update.");
  }
  if (args.requireImages) assertDraftImages(draft);

  const article = {
    title: draft.title,
    author: draft.author,
    summary: draft.summary,
    body: draft.body,
    image: draft.image,
    metafields: draft.metafields,
    isPublished: false,
  };
  for (const key of Object.keys(article)) {
    if (article[key] === undefined) delete article[key];
  }

  if (!args.execute) {
    console.log(JSON.stringify({ previewOnly: true, articleId: args.articleId, article }, null, 2));
    return;
  }

  const updated = await graphql(env, ARTICLE_UPDATE, { id: args.articleId, article });
  assertNoUserErrors("articleUpdate", updated.articleUpdate.userErrors);
  console.log(JSON.stringify(updated.articleUpdate.article, null, 2));
}

async function commandVerify(env, args) {
  if (!args.articleId) throw new Error("verify requires --article-id gid://shopify/Article/...");
  const data = await graphql(env, ARTICLE_VERIFY, { id: args.articleId });
  console.log(JSON.stringify(data.article, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "create-draft" && !args.execute) {
    await commandCreateDraft(null, args);
    return;
  }
  if (args.command === "update-draft" && !args.execute) {
    await commandUpdateDraft(null, args);
    return;
  }
  if (args.requireImages && (args.command === "create-draft" || args.command === "update-draft")) {
    const draft = await readJson(args.input);
    assertDraftImages(draft);
  }

  const env = await loadEnv(args.env);
  if (args.command === "context") await commandContext(env, args);
  if (args.command === "upload-images") await commandUploadImages(env, args);
  if (args.command === "create-draft") await commandCreateDraft(env, args);
  if (args.command === "update-draft") await commandUpdateDraft(env, args);
  if (args.command === "verify") await commandVerify(env, args);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
