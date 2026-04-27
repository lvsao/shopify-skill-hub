#!/usr/bin/env node
import fs from "node:fs/promises";

const DEFAULT_ENV = "skill-hub.env";
const DEFAULT_VERSION_CANDIDATES = ["2026-04", "2026-01", "2025-10", "2025-07"];
const SOFT_ALT_LIMIT = 125;
const HARD_ALT_LIMIT = 512;

function fail(message) {
  console.error(`ERROR: ${message}`);
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
  if (!value) fail("SKILL_HUB_SHOPIFY_STORE_DOMAIN is required.");
  return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim().toLowerCase();
}

async function ensureGitignoreLine(line) {
  const gitignore = ".gitignore";
  const existing = await fs.readFile(gitignore, "utf8").catch(() => null);
  if (existing === null) return { updated: false, reason: "missing .gitignore" };
  if (existing.split(/\r?\n/).includes(line)) return { updated: false, reason: "already ignored" };
  const next = existing.endsWith("\n") ? `${existing}${line}\n` : `${existing}\n${line}\n`;
  await fs.writeFile(gitignore, next, "utf8");
  return { updated: true };
}

async function initEnv(args) {
  const method = args.method || "admin_custom_app";
  const envFile = args.env || DEFAULT_ENV;
  let body;
  if (method === "admin_custom_app") {
    body = `# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
`;
  } else if (method === "dev_dashboard_app") {
    body = `# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id
SKILL_HUB_SHOPIFY_CLIENT_SECRET=shpss_xxx
`;
  } else {
    fail("--method must be admin_custom_app or dev_dashboard_app");
  }

  const exists = await fs.readFile(envFile, "utf8").then(() => true).catch(() => false);
  if (!exists) await fs.writeFile(envFile, body, "utf8");
  const gitignore = await ensureGitignoreLine(envFile);
  console.log(JSON.stringify({ envFile, created: !exists, gitignore }, null, 2));
}

async function requestClientCredentialsToken(shop, env) {
  const clientId = env.SKILL_HUB_SHOPIFY_CLIENT_ID;
  const clientSecret = env.SKILL_HUB_SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) fail("Client ID and client secret are required for dev_dashboard_app.");
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    fail(`Client credentials token request failed for ${shop}: ${json.error_description || json.error || response.status}`);
  }
  return json.access_token;
}

async function adminFetch({ shop, version, token, query, variables }) {
  const response = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok && !json.errors,
    status: response.status,
    location: response.headers.get("location"),
    apiVersion: response.headers.get("x-shopify-api-version") || version,
    json,
  };
}

async function resolveAdmin(env) {
  const method = env.SKILL_HUB_SHOPIFY_ACCESS_METHOD || "admin_custom_app";
  const inputDomain = normalizeDomain(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ shop { name } }" }),
    }).catch((error) => ({ error }));
    const location = probe?.headers?.get?.("location");
    if (location) {
      const host = new URL(location).host.toLowerCase();
      if (host.endsWith(".myshopify.com")) shop = host;
    }
  }

  let token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (method === "dev_dashboard_app") {
    if (!shop.endsWith(".myshopify.com")) fail("Dev Dashboard app setup requires a .myshopify.com store domain.");
    token = await requestClientCredentialsToken(shop, env);
  }
  if (!token || token.includes("xxx") || token.startsWith("your-")) {
    fail("A valid Shopify Admin credential is required in skill-hub.env.");
  }

  const query = `query SkillHubAltTextConnectionCheck { shop { name myshopifyDomain } }`;
  for (const version of uniqueVersions) {
    const result = await adminFetch({ shop, version, token, query, variables: {} });
    if (result.ok) {
      return { shop, version: result.apiVersion, token, shopInfo: result.json.data.shop };
    }
  }
  fail("Could not validate Shopify Admin GraphQL access with the configured credentials.");
}

async function gql(client, query, variables = {}) {
  const result = await adminFetch({
    shop: client.shop,
    version: client.version,
    token: client.token,
    query,
    variables,
  });
  if (!result.ok) {
    const detail = JSON.stringify(result.json.errors || result.json, null, 2);
    fail(`Shopify GraphQL request failed: ${detail}`);
  }
  return result.json.data;
}

function firstImageUrl(node) {
  return node?.image?.url || node?.preview?.image?.url || null;
}

function normalizeAlt(value) {
  return typeof value === "string" ? value.trim() : "";
}

function issueForAlt(alt) {
  if (!alt) return "missing";
  if (alt.length > SOFT_ALT_LIMIT) return "over-soft-limit";
  const words = alt.toLowerCase().split(/[\s,;|/]+/).filter(Boolean);
  const unique = new Set(words);
  if (words.length >= 8 && unique.size / words.length < 0.6) return "repetitive";
  return null;
}

async function readProducts(client, first) {
  const query = `query SkillHubAltTextProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle vendor productType status tags description
        media(first: 50) {
          nodes {
            ... on MediaImage {
              id alt status fileStatus
              image { url width height }
              preview { image { url } }
            }
          }
        }
      }
    }
  }`;
  const products = [];
  let after = null;
  do {
    const data = await gql(client, query, { first, after });
    products.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return products;
}

async function readCollections(client, first) {
  const query = `query SkillHubAltTextCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle descriptionHtml image { url altText } }
    }
  }`;
  const collections = [];
  let after = null;
  do {
    const data = await gql(client, query, { first, after });
    collections.push(...data.collections.nodes);
    after = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
  } while (after);
  return collections;
}

async function readArticles(client, first) {
  const query = `query SkillHubAltTextArticles($first: Int!, $after: String) {
    articles(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle summary body
        blog { title handle }
        image { altText url }
      }
    }
  }`;
  const articles = [];
  let after = null;
  do {
    const data = await gql(client, query, { first, after });
    articles.push(...data.articles.nodes);
    after = data.articles.pageInfo.hasNextPage ? data.articles.pageInfo.endCursor : null;
  } while (after);
  return articles;
}

function extractInlineImages(html) {
  const images = [];
  if (!html) return images;
  const regex = /<img\b[^>]*>/gi;
  let match;
  let index = 0;
  while ((match = regex.exec(html))) {
    const tag = match[0];
    const src = attr(tag, "src") || attr(tag, "data-src");
    const alt = attr(tag, "alt") || "";
    images.push({ index, tag, src, alt, issue: issueForAlt(alt), offset: match.index });
    index += 1;
  }
  return images;
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(regex);
  return match ? (match[2] ?? match[3] ?? match[4] ?? "") : null;
}

async function scan(args) {
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const pageSize = Number(args["page-size"] || 50);
  const includeProducts = args.surface ? String(args.surface).includes("products") : true;
  const includeCollections = args.surface ? String(args.surface).includes("collections") : true;
  const includeArticles = args.surface ? String(args.surface).includes("articles") : true;
  const inventory = {
    scannedAt: new Date().toISOString(),
    shop: { domain: client.shop, apiVersion: client.version, name: client.shopInfo.name },
    summary: {
      products: 0,
      productImages: 0,
      productImagesNeedingOptimization: 0,
      collections: 0,
      collectionImages: 0,
      collectionImagesNeedingOptimization: 0,
      articles: 0,
      articleFeaturedImages: 0,
      articleFeaturedImagesNeedingOptimization: 0,
      articleInlineImages: 0,
      articleInlineImagesNeedingOptimization: 0,
    },
    productImages: [],
    collectionImages: [],
    articleFeaturedImages: [],
    articleInlineImages: [],
    sharedFiles: [],
  };

  const fileRefs = new Map();
  if (includeProducts) {
    const products = await readProducts(client, pageSize);
    inventory.summary.products = products.length;
    for (const product of products) {
      let position = 0;
      for (const media of product.media.nodes.filter(Boolean)) {
        const alt = normalizeAlt(media.alt);
        const issue = issueForAlt(alt);
        const image = {
          type: "product_media",
          id: media.id,
          productId: product.id,
          productTitle: product.title,
          productHandle: product.handle,
          vendor: product.vendor,
          productType: product.productType,
          tags: product.tags,
          status: product.status,
          position,
          currentAlt: alt,
          issue,
          url: firstImageUrl(media),
        };
        inventory.productImages.push(image);
        const refs = fileRefs.get(media.id) || [];
        refs.push({ productId: product.id, productTitle: product.title, position });
        fileRefs.set(media.id, refs);
        position += 1;
      }
    }
    inventory.summary.productImages = inventory.productImages.length;
    inventory.summary.productImagesNeedingOptimization = inventory.productImages.filter((item) => item.issue).length;
    inventory.sharedFiles = [...fileRefs.entries()]
      .filter(([, refs]) => refs.length > 1)
      .map(([id, refs]) => ({ id, references: refs }));
  }

  if (includeCollections) {
    const collections = await readCollections(client, pageSize);
    inventory.summary.collections = collections.length;
    for (const collection of collections) {
      if (!collection.image?.url) continue;
      const alt = normalizeAlt(collection.image.altText);
      const issue = issueForAlt(alt);
      inventory.collectionImages.push({
        type: "collection_featured_image",
        id: collection.id,
        collectionTitle: collection.title,
        collectionHandle: collection.handle,
        descriptionHtml: collection.descriptionHtml,
        currentAlt: alt,
        issue,
        url: collection.image.url,
      });
    }
    inventory.summary.collectionImages = inventory.collectionImages.length;
    inventory.summary.collectionImagesNeedingOptimization = inventory.collectionImages.filter((item) => item.issue).length;
  }

  if (includeArticles) {
    const articles = await readArticles(client, pageSize);
    inventory.summary.articles = articles.length;
    for (const article of articles) {
      if (article.image?.url) {
        const alt = normalizeAlt(article.image.altText);
        const issue = issueForAlt(alt);
        inventory.articleFeaturedImages.push({
          type: "article_featured_image",
          id: article.id,
          articleTitle: article.title,
          articleHandle: article.handle,
          blogTitle: article.blog?.title,
          summary: article.summary,
          currentAlt: alt,
          issue,
          url: article.image.url,
        });
      }
      for (const image of extractInlineImages(article.body)) {
        inventory.articleInlineImages.push({
          type: "article_inline_image",
          id: `${article.id}#inline-${image.index}`,
          articleId: article.id,
          articleTitle: article.title,
          articleHandle: article.handle,
          blogTitle: article.blog?.title,
          inlineIndex: image.index,
          src: image.src,
          currentAlt: normalizeAlt(image.alt),
          issue: image.issue,
        });
      }
    }
    inventory.summary.articleFeaturedImages = inventory.articleFeaturedImages.length;
    inventory.summary.articleFeaturedImagesNeedingOptimization = inventory.articleFeaturedImages.filter((item) => item.issue).length;
    inventory.summary.articleInlineImages = inventory.articleInlineImages.length;
    inventory.summary.articleInlineImagesNeedingOptimization = inventory.articleInlineImages.filter((item) => item.issue).length;
  }

  console.log(JSON.stringify(inventory, null, 2));
}

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.changes)) fail("Plan JSON must contain a changes array.");
  const errors = [];
  for (const [index, change] of plan.changes.entries()) {
    if (!change.type) errors.push(`changes[${index}].type is required`);
    if (!change.id) errors.push(`changes[${index}].id is required`);
    if (typeof change.alt !== "string" || !change.alt.trim()) errors.push(`changes[${index}].alt is required`);
    if (change.alt && change.alt.length > HARD_ALT_LIMIT) errors.push(`changes[${index}].alt exceeds ${HARD_ALT_LIMIT} characters`);
    if (change.source === "vision" && (typeof change.visualEvidence !== "string" || !change.visualEvidence.trim())) {
      errors.push(`changes[${index}].visualEvidence is required when source is "vision"`);
    }
  }
  if (errors.length) fail(errors.join("\n"));
}

async function loadPlan(file) {
  let text;
  if (file === "-") {
    text = await new Promise((resolve, reject) => {
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        input += chunk;
      });
      process.stdin.on("end", () => resolve(input));
      process.stdin.on("error", reject);
    });
  } else {
    text = await fs.readFile(file, "utf8").catch(() => null);
  }
  if (!text) fail(`Missing plan input: ${file || "(missing)"}`);
  const plan = JSON.parse(text);
  validatePlan(plan);
  return plan;
}

function replaceInlineAlt(html, inlineIndex, alt) {
  let seen = 0;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (seen !== inlineIndex) {
      seen += 1;
      return tag;
    }
    seen += 1;
    const escaped = alt.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    if (/\balt\s*=/i.test(tag)) {
      return tag.replace(/\balt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i, `alt="${escaped}"`);
    }
    return tag.replace(/\/?>$/, (end) => ` alt="${escaped}"${end}`);
  });
}

async function applyPlan(args) {
  const plan = await loadPlan(args.input);
  const execute = Boolean(args.execute);
  if (!execute) {
    console.log(JSON.stringify({ mode: "preview", changes: plan.changes }, null, 2));
    return;
  }
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  const results = [];

  const fileUpdates = plan.changes
    .filter((change) => change.type === "product_media")
    .map((change) => ({ id: change.id, alt: change.alt }));
  if (fileUpdates.length) {
    const data = await gql(
      client,
      `mutation SkillHubAltTextFileUpdate($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) {
          files { id alt fileStatus }
          userErrors { field message code }
        }
      }`,
      { files: fileUpdates },
    );
    results.push({ type: "product_media", response: data.fileUpdate });
  }

  for (const change of plan.changes.filter((item) => item.type === "collection_featured_image")) {
    const src = change.url || change.src;
    if (!src) fail(`collection change ${change.id} needs url to preserve the image.`);
    const data = await gql(
      client,
      `mutation SkillHubAltTextCollectionUpdate($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id image { url altText } }
          userErrors { field message }
        }
      }`,
      { input: { id: change.id, image: { src, altText: change.alt } } },
    );
    results.push({ type: "collection_featured_image", id: change.id, response: data.collectionUpdate });
  }

  for (const change of plan.changes.filter((item) => item.type === "article_featured_image")) {
    const url = change.url || change.src;
    if (!url) fail(`article featured image change ${change.id} needs url to preserve the image.`);
    const data = await gql(
      client,
      `mutation SkillHubAltTextArticleImageUpdate($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id image { altText url } }
          userErrors { code field message }
        }
      }`,
      { id: change.id, article: { image: { url, altText: change.alt } } },
    );
    results.push({ type: "article_featured_image", id: change.id, response: data.articleUpdate });
  }

  const inlineByArticle = new Map();
  for (const change of plan.changes.filter((item) => item.type === "article_inline_image")) {
    if (!change.articleId || !Number.isInteger(change.inlineIndex)) {
      fail(`article inline change ${change.id} needs articleId and numeric inlineIndex.`);
    }
    const list = inlineByArticle.get(change.articleId) || [];
    list.push(change);
    inlineByArticle.set(change.articleId, list);
  }
  for (const [articleId, changes] of inlineByArticle.entries()) {
    const current = await gql(
      client,
      `query SkillHubAltTextArticleBody($id: ID!) { article(id: $id) { id body } }`,
      { id: articleId },
    );
    let body = current.article.body;
    for (const change of changes.sort((left, right) => left.inlineIndex - right.inlineIndex)) {
      body = replaceInlineAlt(body, change.inlineIndex, change.alt);
    }
    const data = await gql(
      client,
      `mutation SkillHubAltTextArticleBodyUpdate($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id }
          userErrors { code field message }
        }
      }`,
      { id: articleId, article: { body } },
    );
    results.push({ type: "article_inline_image", articleId, changed: changes.length, response: data.articleUpdate });
  }

  console.log(JSON.stringify({ mode: "execute", results }, null, 2));
}

async function connectionCheck(args) {
  const env = await loadEnv(args.env || DEFAULT_ENV);
  const client = await resolveAdmin(env);
  console.log(JSON.stringify({
    ok: true,
    shop: { domain: client.shop, apiVersion: client.version, name: client.shopInfo.name, myshopifyDomain: client.shopInfo.myshopifyDomain },
  }, null, 2));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === "init-env") return initEnv(args);
  if (command === "connection-check") return connectionCheck(args);
  if (command === "scan") return scan(args);
  if (command === "apply") return applyPlan(args);
  fail(`Unknown command: ${command || "(missing)"}`);
}

main().catch((error) => fail(error.stack || error.message));
