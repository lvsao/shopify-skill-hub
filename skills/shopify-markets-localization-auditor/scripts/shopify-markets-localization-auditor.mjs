#!/usr/bin/env node

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ENV = "skill-hub.env";
const REQUIRED_SCOPES = "read_locales,write_locales,read_markets,write_markets,read_translations,write_translations,read_shipping,read_legal_policies";
const DEFAULT_RESOURCE_TYPES = [
  "PRODUCT",
  "COLLECTION",
  "PAGE",
  "BLOG",
  "ARTICLE",
  "SHOP",
  "SHOP_POLICY",
];
const SKIP_TRANSLATABLE_TYPES = new Set([
  "URI",
  "URL",
  "LINK",
  "LIST_URL",
  "LIST_LINK",
  "FILE_REFERENCE",
  "LIST_FILE_REFERENCE",
  "JSON",
  "JSON_STRING",
]);

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return {
      command: "help",
      env: DEFAULT_ENV,
      input: null,
      output: null,
      method: null,
      locales: null,
      execute: false,
      lang: "auto",
    };
  }

  const args = {
    command: argv[0],
    env: DEFAULT_ENV,
    input: null,
    output: null,
    method: null,
    locales: null,
    execute: false,
    lang: "auto",
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
    } else if (key === "--output") {
      args.output = value;
      i += 1;
    } else if (key === "--method") {
      args.method = value;
      i += 1;
    } else if (key === "--locales") {
      args.locales = value;
      i += 1;
    } else if (key === "--execute") {
      args.execute = true;
    } else if (key === "--lang") {
      args.lang = value;
      i += 1;
    }
  }

  const valid = ["help", "init-env", "connection-check", "audit", "report", "fix-plan", "apply"];
  if (!valid.includes(args.command)) {
    throw new Error(
      "Usage: node shopify-markets-localization-auditor.mjs <init-env|connection-check|audit|report|fix-plan|apply> [--env skill-hub.env] [--input file.json] [--output file] [--locales de,fr,ja] [--method admin_custom_app|dev_dashboard_app] [--lang zh-CN|en|auto] [--execute]",
    );
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node shopify-markets-localization-auditor.mjs init-env --method admin_custom_app --env skill-hub.env
  node shopify-markets-localization-auditor.mjs init-env --method dev_dashboard_app --env skill-hub.env
  node shopify-markets-localization-auditor.mjs connection-check --env skill-hub.env
  node shopify-markets-localization-auditor.mjs audit --env skill-hub.env --output shopify-markets-localization-audit.json --lang zh-CN
  node shopify-markets-localization-auditor.mjs report --input shopify-markets-localization-audit.json --output shopify-markets-localization-report.html --lang zh-CN
  node shopify-markets-localization-auditor.mjs fix-plan --input shopify-markets-localization-audit.json --output shopify-markets-localization-fix-plan.json
  node shopify-markets-localization-auditor.mjs apply --env skill-hub.env --input shopify-markets-localization-fix-plan.json
  node shopify-markets-localization-auditor.mjs apply --env skill-hub.env --input shopify-markets-localization-fix-plan.json --execute
`);
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

async function ensureGitignoreLine(line) {
  const file = ".gitignore";
  const existing = await readFile(file, "utf8").catch(() => null);
  if (existing === null) return { updated: false, reason: "missing .gitignore" };
  if (existing.split(/\r?\n/).includes(line)) return { updated: false, reason: "already ignored" };
  const next = existing.endsWith("\n") ? `${existing}${line}\n` : `${existing}\n${line}\n`;
  await writeFile(file, next, "utf8");
  return { updated: true };
}

async function initEnv(args) {
  const method = args.method || "admin_custom_app";
  const envFile = args.env || DEFAULT_ENV;
  let gitignoreCreated = false;
  let body;
  if (method === "admin_custom_app") {
    body = `# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=admin.shopify.com/store/your-store
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
`;
  } else if (method === "dev_dashboard_app") {
    body = `# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=admin.shopify.com/store/your-store
SKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id
SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN=atkn_your-token
`;
  } else {
    throw new Error("--method must be admin_custom_app or dev_dashboard_app");
  }

  const alreadyExists = existsSync(envFile);
  if (!alreadyExists) await writeFile(envFile, body, "utf8");
  if (!existsSync(".gitignore")) {
    await writeFile(".gitignore", `${envFile}\n`, "utf8");
    gitignoreCreated = true;
  }
  const gitignore = await ensureGitignoreLine(envFile);
  const currentEnv = parseEnv(await readFile(envFile, "utf8"));
  const placeholderDetected = Object.values(currentEnv).some((value) =>
    typeof value === "string" && (
      value.includes("your-store") ||
      value.includes("your-client-id") ||
      value.includes("shpat_xxx") ||
      value.includes("atkn_your-token")
    ));
  console.log(JSON.stringify({
    ok: true,
    envFile,
    created: !alreadyExists,
    gitignore: gitignoreCreated && gitignore.reason === "already ignored"
      ? { updated: false, reason: "created with env file entry" }
      : gitignore,
    placeholderDetected,
    warning: placeholderDetected
      ? "The env file still contains placeholder values. Replace them with real store credentials before connection-check."
      : null,
    requiredScopes: REQUIRED_SCOPES,
  }, null, 2));
}

function normalizeDomain(value) {
  const raw = value.trim();
  if (/admin\.shopify\.com\/store\//i.test(raw)) {
    const match = raw.match(/admin\.shopify\.com\/store\/([^\/\s?&]+)/i);
    if (match) return `${match[1].toLowerCase()}.myshopify.com`;
  }
  const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
  return url.host.toLowerCase();
}

async function resolveStorefrontToMyshopify(host) {
  const candidates = [
    `https://${host}`,
    `https://${host}/products`,
    `https://${host}/collections`,
  ];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        headers: {
          "User-Agent": "Selofy Skill Hub Markets Localization Auditor/1.0",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await response.text();
      const match = html.match(/Shopify\.shop\s*=\s*"([^"]+\.myshopify\.com)"/i);
      if (match) return match[1].toLowerCase();
      const alt = html.match(/store:\s*['"]https?:\/\/([^'"]+\.myshopify\.com)['"]/i);
      if (alt) return alt[1].toLowerCase();
    } catch {}
  }

  return null;
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

  throw new Error("Could not resolve a usable Shopify Admin API endpoint from the provided store domain and Admin API token.");
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
  const error = new Error("CLI_NOT_FOUND: Could not locate Shopify CLI JS entrypoint. Set SKILL_HUB_SHOPIFY_CLI_JS to @shopify/cli/bin/run.js.");
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
    const cliArgs = [
      cliJs,
      "store",
      "execute",
      "--store",
      env.SHOPIFY_API_DOMAIN,
      "--query-file",
      queryFile,
      "--variable-file",
      variableFile,
      "--output-file",
      outputFile,
      "--json",
      "--no-color",
    ];
    if (/(^|\n)\s*mutation\b/i.test(query)) cliArgs.push("--allow-mutations");

    const execResult = await execFileAsync(process.execPath, cliArgs, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 20,
      windowsHide: true,
    }).catch((error) => ({ cliError: classifyCliError(error, [error.stderr, error.stdout].filter(Boolean).map(String).join("\n")) }));

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

async function loadEnv(envPath) {
  const text = await readFile(envPath, "utf8").catch(() => null);
  if (!text) {
    throw new Error(`Missing env file: ${envPath}. Current working directory: ${process.cwd()}. The env must be in the user's working directory, not the installed skill directory.`);
  }
  const env = parseEnv(text);
  env.SHOPIFY_STORE_DOMAIN = env.SKILL_HUB_SHOPIFY_STORE_DOMAIN || env.SHOPIFY_STORE_DOMAIN || env.SHOPIFY_TEST_STORE_DOMAIN;
  env.SHOPIFY_ADMIN_API_ACCESS_TOKEN = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN || env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  env.SHOPIFY_CLIENT_ID = env.SKILL_HUB_SHOPIFY_CLIENT_ID || env.SHOPIFY_CLIENT_ID;
  const preferredVersion = env.SKILL_HUB_SHOPIFY_API_VERSION || env.SHOPIFY_API_VERSION;
  if (!env.SHOPIFY_STORE_DOMAIN) throw new Error(`Missing SHOPIFY_STORE_DOMAIN in ${envPath}.`);

  env.SHOPIFY_STORE_DOMAIN = normalizeDomain(env.SHOPIFY_STORE_DOMAIN);
  const accessMethod = env.SKILL_HUB_SHOPIFY_ACCESS_METHOD || (env.SHOPIFY_CLIENT_ID ? "dev_dashboard_app" : "admin_custom_app");

  if (accessMethod === "dev_dashboard_app") {
    if (env.SHOPIFY_STORE_DOMAIN.endsWith(".myshopify.com")) {
      env.SHOPIFY_API_DOMAIN = env.SHOPIFY_STORE_DOMAIN;
    } else {
      const resolved = await resolveStorefrontToMyshopify(env.SHOPIFY_STORE_DOMAIN);
      if (!resolved) {
        throw new Error("Could not resolve the storefront domain to a .myshopify.com store domain for the Dev Dashboard path.");
      }
      env.SHOPIFY_API_DOMAIN = resolved;
      env.SHOPIFY_STORE_DOMAIN = resolved;
    }
    env.SHOPIFY_API_VERSION = "shopify-cli";
    env.SHOPIFY_TRANSPORT = "shopify_cli";
    return env;
  }

  if (!env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    throw new Error(`Missing SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN in ${envPath} for admin_custom_app.`);
  }

  const endpoint = await resolveAdminEndpoint(env, preferredVersion);
  env.SHOPIFY_API_DOMAIN = endpoint.host;
  env.SHOPIFY_API_VERSION = endpoint.version;
  return env;
}

async function graphql(env, query, variables = {}) {
  if (env.SHOPIFY_TRANSPORT === "shopify_cli") {
    return shopifyCliGraphql(env, query, variables);
  }

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

function writeJsonOutput(value, outputPath) {
  const text = JSON.stringify(value, null, 2);
  if (!outputPath) {
    console.log(text);
    return;
  }
  return mkdir(path.dirname(path.resolve(outputPath)), { recursive: true })
    .then(() => writeFile(outputPath, text, "utf8"))
    .then(() => console.log(JSON.stringify({ ok: true, output: outputPath }, null, 2)));
}

function parseLocales(raw) {
  if (!raw) return null;
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url, headers = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Selofy Skill Hub Markets Localization Auditor/1.0",
        "Accept-Language": "en-US,en;q=0.9",
        ...headers,
      },
      redirect: "follow",
    });
    const html = await response.text();
    return { ok: response.ok, status: response.status, url: response.url, html };
  } catch (error) {
    return { ok: false, status: 0, url, html: "", error: error.message };
  }
}

function extractPolicyLinks(html, origin) {
  const links = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html))) {
    const href = match[1];
    if (!/policy|refund|shipping|privacy|terms|return/i.test(href)) continue;
    try {
      links.push(new URL(href, origin).href);
    } catch {}
  }
  return [...new Set(links)];
}

async function crawlStorefront(shop) {
  const storefrontUrl = shop.primaryDomain?.url || `https://${shop.primaryDomain?.host || shop.myshopifyDomain}`;
  const home = await fetchHtml(storefrontUrl);
  const canonical = home.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || null;
  const hreflangMatches = [...home.html.matchAll(/<link[^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["']/gi)];
  const hreflangs = hreflangMatches.map((match) => ({ locale: match[1], href: match[2] }));
  const policyLinks = extractPolicyLinks(home.html, storefrontUrl);

  return {
    storefrontUrl,
    homeStatus: home.status,
    canonical,
    hreflangCount: hreflangs.length,
    hreflangs,
    policyLinks,
  };
}

const OVERVIEW_QUERY = `#graphql
query MarketsAuditOverview {
  shop {
    name
    description
    myshopifyDomain
    currencyCode
    primaryDomain {
      host
      url
    }
    shopPolicies {
      id
      type
      title
      url
      body
    }
  }
  collections(first: 12, sortKey: UPDATED_AT) {
    nodes {
      title
      handle
    }
  }
  products(first: 12, sortKey: UPDATED_AT) {
    nodes {
      title
      handle
      productType
      tags
    }
  }
  shopLocales {
    name
    locale
    primary
    published
  }
  markets(first: 50) {
    nodes {
      id
      name
      handle
      enabled
      primary
      status
      currencySettings {
        localCurrencies
        baseCurrency {
          currencyCode
          currencyName
          enabled
        }
      }
      webPresence {
        id
        subfolderSuffix
        defaultLocale {
          locale
        }
        alternateLocales {
          locale
        }
        rootUrls {
          locale
          url
        }
      }
      regions(first: 250) {
        nodes {
          ... on MarketRegionCountry {
            id
            name
            code
          }
        }
      }
    }
  }
  deliveryProfiles(first: 50) {
    nodes {
      id
      name
      profileLocationGroups {
        countriesInAnyZone {
          country {
            code {
              countryCode
              restOfWorld
            }
            name
          }
          zone
        }
      }
    }
  }
}`;

const TRANSLATABLE_QUERY = `#graphql
query LocaleCoveragePage($resourceType: TranslatableResourceType!, $locale: String!, $after: String) {
  translatableResources(first: 100, resourceType: $resourceType, after: $after) {
    nodes {
      resourceId
      translatableContent {
        key
        value
        type
        digest
      }
      translations(locale: $locale) {
        key
        value
        outdated
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

const CONNECTION_QUERY = `#graphql
query SkillHubConnectionCheck {
  shop {
    name
    myshopifyDomain
  }
}`;

async function cmdConnectionCheck(args) {
  const env = await loadEnv(args.env);
  const data = await graphql(env, CONNECTION_QUERY);
  console.log(JSON.stringify({
    status: "OK",
    shop: data.shop.name,
    myshopifyDomain: data.shop.myshopifyDomain,
    transport: env.SHOPIFY_TRANSPORT || "admin_api",
  }, null, 2));
}

async function computeLocaleCoverage(env, locale, resourceTypes) {
  const totals = {
    locale,
    resourceTypes,
    eligible: 0,
    current: 0,
    outdated: 0,
    missing: 0,
    resources: 0,
    perType: [],
  };

  for (const resourceType of resourceTypes) {
    const perType = { resourceType, eligible: 0, current: 0, outdated: 0, missing: 0, resources: 0 };
    let after = null;
    let hasNextPage = true;
    while (hasNextPage) {
      const page = await graphql(env, TRANSLATABLE_QUERY, { resourceType, locale, after });
      const connection = page.translatableResources;
      for (const node of connection.nodes || []) {
        perType.resources += 1;
        const translationMap = Object.fromEntries((node.translations || []).map((entry) => [entry.key, entry]));
        for (const content of node.translatableContent || []) {
          if (content.key === "handle") continue;
          if (SKIP_TRANSLATABLE_TYPES.has(content.type)) continue;
          perType.eligible += 1;
          const translation = translationMap[content.key];
          if (!translation) perType.missing += 1;
          else if (translation.outdated) perType.outdated += 1;
          else perType.current += 1;
        }
      }
      hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
      after = connection.pageInfo?.endCursor || null;
    }
    totals.eligible += perType.eligible;
    totals.current += perType.current;
    totals.outdated += perType.outdated;
    totals.missing += perType.missing;
    totals.resources += perType.resources;
    totals.perType.push(perType);
  }

  totals.readinessPct = totals.eligible ? Math.round((totals.current / totals.eligible) * 100) : 0;
  totals.gapPct = totals.eligible ? 100 - totals.readinessPct : 0;
  return totals;
}

function inferStoreProfile(data) {
  const collections = (data.collections?.nodes || []).map((item) => item.title).filter(Boolean);
  const products = (data.products?.nodes || []).filter(Boolean);
  const productTitles = products.map((item) => item.title).filter(Boolean);
  const productTypes = products.map((item) => item.productType).filter(Boolean);
  const productTags = products.flatMap((item) => Array.isArray(item.tags) ? item.tags : []).filter(Boolean);
  const evidenceLines = [
    data.shop?.name || "",
    data.shop?.description || "",
    ...collections,
    ...productTitles,
    ...productTypes,
    ...productTags,
  ].filter(Boolean);
  const categoryRules = [
    { key: "winter-sports", pattern: /(ski|skis|skiing|snowboard|winter sports?)/ },
    { key: "pet", pattern: /(pet|dog|cat|carrier|harness)/ },
    { key: "beauty", pattern: /(beauty|skincare|cosmetic)/ },
    { key: "jewelry", pattern: /(jewelry|necklace|ring|bracelet)/ },
    { key: "home", pattern: /(home|decor|kitchen|bedding|furniture)/ },
  ];
  const categoryScores = new Map(categoryRules.map((rule) => [rule.key, 0]));

  for (const line of evidenceLines) {
    const normalized = line.toLowerCase();
    for (const rule of categoryRules) {
      if (rule.pattern.test(normalized)) {
        categoryScores.set(rule.key, (categoryScores.get(rule.key) || 0) + 1);
      }
    }
  }

  const categoryLabels = [...categoryScores.entries()]
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  let summary = "general ecommerce brand";
  if (categoryLabels.includes("winter-sports")) summary = "winter sports and ski gear brand";
  else if (categoryLabels.includes("pet")) summary = "pet-focused brand";
  else if (categoryLabels.includes("beauty")) summary = "beauty-focused brand";
  else if (categoryLabels.includes("jewelry")) summary = "jewelry-focused brand";
  else if (categoryLabels.includes("home")) summary = "home-focused brand";

  return {
    status: "store_profile_only",
    summary,
    categoryLabels,
    evidence: {
      shopName: data.shop?.name || "",
      shopDescription: data.shop?.description || "",
      collections,
      productTitles,
      productTypes,
      categoryScores: Object.fromEntries(categoryScores),
    },
    nextStep: "Complete external market research with at least 3 fresh category-country references before final country recommendations.",
  };
}

function normalizeOverview(data) {
  const localeMap = new Map((data.shopLocales || []).map((locale) => [locale.locale, locale]));
  const markets = (data.markets?.nodes || []).map((market) => {
    const countries = (market.regions?.nodes || []).map((country) => ({
      code: country.code,
      name: country.name,
    }));
    const defaultLocale = market.webPresence?.defaultLocale?.locale || null;
    const alternateLocales = (market.webPresence?.alternateLocales || []).map((entry) => entry.locale);
    return {
      id: market.id,
      name: market.name,
      handle: market.handle,
      enabled: market.enabled,
      primary: market.primary,
      status: market.status,
      defaultLocale,
      alternateLocales,
      allLocales: [defaultLocale, ...alternateLocales].filter(Boolean),
      countryCodes: countries.map((country) => country.code),
      countries,
      localCurrencies: Boolean(market.currencySettings?.localCurrencies),
      baseCurrencyCode: market.currencySettings?.baseCurrency?.currencyCode || null,
      baseCurrencyName: market.currencySettings?.baseCurrency?.currencyName || null,
      baseCurrencyEnabled: Boolean(market.currencySettings?.baseCurrency?.enabled),
      webPresenceId: market.webPresence?.id || null,
      subfolderSuffix: market.webPresence?.subfolderSuffix || null,
      rootUrls: market.webPresence?.rootUrls || [],
    };
  });

  const shippingCountries = new Set();
  const deliveryProfiles = (data.deliveryProfiles?.nodes || []).map((profile) => {
    const countries = [];
    for (const group of profile.profileLocationGroups || []) {
      for (const entry of group.countriesInAnyZone || []) {
        const countryCode = entry?.country?.code?.countryCode;
        if (!countryCode || entry.country.code.restOfWorld) continue;
        shippingCountries.add(countryCode);
        countries.push({
          code: countryCode,
          name: entry.country.name,
          zone: entry.zone,
        });
      }
    }
    return { id: profile.id, name: profile.name, countries };
  });

  return {
    shop: data.shop,
    storeProfile: inferStoreProfile(data),
    shopLocales: data.shopLocales || [],
    localeMap,
    markets,
    deliveryProfiles,
    shippingCountryCodes: [...shippingCountries],
  };
}

function chooseLocalesForAudit(overview, requestedLocales) {
  const primaryLocale = overview.shopLocales.find((locale) => locale.primary)?.locale || null;
  if (requestedLocales?.length) return requestedLocales.filter((locale) => locale !== primaryLocale);
  const locales = new Set();
  for (const locale of overview.shopLocales) {
    if (!locale.primary && locale.published) locales.add(locale.locale);
  }
  for (const market of overview.markets) {
    for (const locale of market.allLocales) {
      if (locale !== primaryLocale) locales.add(locale);
    }
  }
  return [...locales];
}

function buildFindings(overview, coverageByLocale, storefront) {
  const findings = [];
  const workingWell = [];
  const localeCoverageMap = new Map(coverageByLocale.map((entry) => [entry.locale, entry]));

  for (const locale of overview.shopLocales) {
    if (locale.primary && locale.published) {
      workingWell.push({
        title: `${locale.locale} is live`,
        summary: "The store's main language is enabled and visible to shoppers.",
        nextStep: "",
      });
    }
  }

  for (const market of overview.markets) {
    for (const localeCode of market.allLocales) {
      const locale = overview.localeMap.get(localeCode);
      if (!locale) {
        findings.push({
          level: "high",
          bucket: "fix-now",
          title: `${market.name} points to a language that is not enabled`,
          summary: `${localeCode} is attached to this market, but the store does not have it enabled.`,
          nextStep: "Enable the language first, then re-check the market setup.",
        });
      } else if (!locale.published) {
        findings.push({
          level: "high",
          bucket: "fix-now",
          title: `${market.name} uses a language that is still hidden`,
          summary: `${localeCode} exists, but shoppers cannot fully use it yet because it is not published.`,
          nextStep: "Publish the language, then refresh this market check.",
        });
      }
    }

    if (!market.webPresenceId) {
      findings.push({
        level: "medium",
        bucket: "tidy-next",
        title: `${market.name} has no dedicated web setup yet`,
        summary: "Shoppers can still reach the store, but the market does not have a clean URL setup for its local experience.",
        nextStep: "Review whether this market needs its own subfolder or domain strategy.",
      });
    }

    if (!market.localCurrencies && market.countryCodes.length > 1) {
      findings.push({
        level: "medium",
        bucket: "tidy-next",
        title: `${market.name} is sharing one money setup across several countries`,
        summary: "This is not always wrong, but it often leads to a less local buying experience.",
        nextStep: "Review whether local currencies should be turned on for this market.",
      });
    }

    const missingShipping = market.countryCodes.filter((code) => !overview.shippingCountryCodes.includes(code));
    if (missingShipping.length) {
      findings.push({
        level: "high",
        bucket: "fix-now",
        title: `${market.name} has countries with no shipping coverage`,
        summary: `${missingShipping.length} country${missingShipping.length === 1 ? "" : "ies"} in this market do not appear in any shipping zone.`,
        nextStep: "Add shipping coverage or remove those countries from the market until shipping is ready.",
      });
    } else if (market.countryCodes.length) {
      workingWell.push({
        title: `${market.name} has shipping coverage`,
        summary: "Every country in this market appears in at least one shipping zone.",
        nextStep: "",
      });
    }
  }

  for (const coverage of coverageByLocale) {
    if (coverage.readinessPct < 70) {
      findings.push({
        level: "high",
        bucket: "fix-now",
        title: `${coverage.locale} is not ready enough yet`,
        summary: `Only ${coverage.readinessPct}% of the checked text is up to date.`,
        nextStep: "Bring missing and old translations up to date before treating this language as finished.",
      });
    } else if (coverage.readinessPct < 90 || coverage.outdated > 0) {
      findings.push({
        level: "medium",
        bucket: "tidy-next",
        title: `${coverage.locale} still has cleanup work`,
        summary: `${coverage.missing + coverage.outdated} pieces of text are still missing or old.`,
        nextStep: "Tidy the remaining gaps so the whole language feels complete.",
      });
    } else {
      workingWell.push({
        title: `${coverage.locale} is in good shape`,
        summary: `Most checked text is current, with ${coverage.readinessPct}% ready.`,
        nextStep: "",
      });
    }
  }

  if (!storefront.canonical) {
    findings.push({
      level: "high",
      bucket: "fix-now",
      title: "The storefront is missing a canonical link",
      summary: "Search engines are not getting a clear main URL signal from the home page.",
      nextStep: "Add a canonical tag in the theme head.",
    });
  }

  if (storefront.hreflangCount === 0 && coverageByLocale.length > 0) {
    findings.push({
      level: "high",
      bucket: "fix-now",
      title: "Localized pages are missing language links for search engines",
      summary: "The home page does not expose `hreflang` alternate links.",
      nextStep: "Add `hreflang` support so search engines can understand the language versions.",
    });
  }

  const policyUrls = (overview.shop.shopPolicies || [])
    .map((policy) => policy.url)
    .filter(Boolean);
  if (!policyUrls.length) {
    findings.push({
      level: "medium",
      bucket: "tidy-next",
      title: "The store is light on policy pages",
      summary: "Key policy pages are missing from the Admin data.",
      nextStep: "Add policy pages so shoppers can understand shipping, returns, and privacy before buying.",
    });
  }

  if (policyUrls.length && storefront.policyLinks.length === 0) {
    findings.push({
      level: "medium",
      bucket: "tidy-next",
      title: "Policy pages exist but are hard to reach from the storefront",
      summary: "The storefront crawl did not find obvious policy links on the home page.",
      nextStep: "Add policy links to the footer or another consistent store area.",
    });
  }

  return { findings, workingWell };
}

function buildFixPlan(overview, coverageByLocale) {
  const actions = [];
  const actionIds = new Set();
  const localeMap = overview.localeMap;
  const weakLocales = coverageByLocale.filter((item) => item.readinessPct < 70);

  function pushAction(action) {
    if (actionIds.has(action.id)) return;
    actionIds.add(action.id);
    actions.push(action);
  }

  for (const market of overview.markets) {
    for (const localeCode of market.allLocales) {
      const locale = localeMap.get(localeCode);
      if (!locale) {
        pushAction({
          id: `enable-publish-${localeCode}`,
          type: "enable_publish_locale",
          title: `Turn on ${localeCode}`,
          summary: `This language is attached to a market but is not enabled in the store.`,
          reason: "The market cannot work cleanly until the language exists and is published.",
          risk: "low",
          executeSupported: true,
          variables: { locale: localeCode },
        });
      } else if (!locale.published) {
        pushAction({
          id: `publish-${localeCode}`,
          type: "publish_locale",
          title: `Publish ${localeCode}`,
          summary: `This language already exists, but shoppers still cannot fully use it.`,
          reason: "Publishing it is the smallest safe fix.",
          risk: "low",
          executeSupported: true,
          variables: { locale: localeCode },
        });
      }
    }

    if (!market.localCurrencies && market.countryCodes.length > 1) {
      pushAction({
        id: `local-currencies-${market.id}`,
        type: "enable_local_currencies",
        title: `Turn on local currencies for ${market.name}`,
        summary: "This market covers several countries but local currencies are off.",
        reason: "This often improves the local shopping experience. Shopify Payments support may still be required.",
        risk: "medium",
        executeSupported: true,
        variables: { marketId: market.id },
      });
    }
  }

  return {
    actions,
    explanation: actions.length === 0 && weakLocales.length
      ? `The main gaps are translation-readiness issues in ${weakLocales.map((item) => item.locale).join(", ")}. V1 does not auto-write translations, so these need manual translation work or a translation app instead of a direct Admin API fix.`
      : "",
  };
}

function groupFindings(findings, bucket) {
  return findings.filter((item) => item.bucket === bucket);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function takeLabels(values, limit = 6) {
  if (values.length <= limit) return values;
  return [...values.slice(0, limit), `+${values.length - limit}`];
}

function buildLocaleStatusLabel(locale, zh) {
  if (locale.primary) return zh ? "主语言" : "Primary";
  if (locale.published) return zh ? "已发布" : "Published";
  return zh ? "已添加未发布" : "Enabled, not published";
}

function buildMarketCurrencyLabel(market, zh) {
  const base = market.baseCurrencyCode || (zh ? "店铺基础币种" : "shop base currency");
  if (market.localCurrencies) {
    return zh ? "自动按国家显示本地货币" : "Auto local currencies by country";
  }
  if (market.countryCodes.length <= 1) {
    return zh ? `固定为 ${base}` : `Fixed to ${base}`;
  }
  return zh ? `多个国家共用 ${base}` : `Shared ${base} across countries`;
}

function buildMarketUrlLabel(market, zh) {
  if (market.webPresenceId && market.subfolderSuffix) {
    return zh ? `子目录 /${market.subfolderSuffix}/` : `Subfolder /${market.subfolderSuffix}/`;
  }
  if (market.webPresenceId && market.rootUrls.length) {
    const root = market.rootUrls[0]?.url || "";
    return zh ? `独立入口 ${root}` : `Dedicated URL ${root}`;
  }
  return zh ? "跟随主站入口" : "Shared main storefront entry";
}

function buildExpansionIdeasFromAudit(audit, zh) {
  const publishedCount = audit.shopLocales.filter((item) => item.published && !item.primary).length;
  const remainingSlots = Math.max(0, 20 - publishedCount);
  const localeSet = new Set(audit.shopLocales.map((item) => item.locale));
  const weakLocales = audit.localeCoverage.filter((item) => item.readinessPct < 65);
  const sharedUrlMarkets = audit.markets.filter((market) => !market.webPresenceId);
  const sharedCurrencyMarkets = audit.markets.filter((market) => !market.localCurrencies && market.countryCodes.length > 1);
  const multilingualMarkets = audit.markets.filter((market) => market.allLocales.length > 1);
  const profile = audit.storeProfile || null;
  const ideas = [];

  if (profile) {
    ideas.push({
      title: zh ? "店铺画像" : "Store profile",
      summary: zh
        ? `基于店名、描述、系列和商品标题，这家店当前更像是 ${profile.summary}。`
        : `Based on the shop name, description, collections, and product titles, this store currently looks like a ${profile.summary}.`,
      nextStep: zh
        ? "这一步只是店铺画像，不等于最终国家建议。真正的市场建议还需要补外部行业研究。"
        : "This is only the store profile, not the final country recommendation. External market research is still required.",
    });
  }

  ideas.push({
    title: zh ? "先补外部研究，再给国家建议" : "Finish external research before country advice",
    summary: zh
      ? "当前脚本只完成了店铺画像，还没有完成至少 3 份外部行业资料交叉验证，所以这里不直接输出硬性的国家结论。"
      : "This script completes the store profile, but it does not complete the required 3-source external research step, so it should not output hard country conclusions yet.",
    nextStep: zh
      ? "下一步请围绕这个品类补至少 3 份最新可信资料，再决定优先国家。"
      : "Next, gather at least 3 fresh category-country references before finalizing priority countries.",
  });

  ideas.push({
    title: zh ? `还可以再增加 ${remainingSlots} 个已发布语言` : `You still have room for ${remainingSlots} more published language${remainingSlots === 1 ? "" : "s"}`,
    summary: zh ? "Shopify 最多还能继续增加语言，但剩余名额更适合留给真正有转化潜力的国家。" : "There is still room to add languages, but the remaining slots should go to the markets that can really convert.",
    nextStep: zh ? "不要平均铺开，优先给最值得做深的国家和语言。" : "Do not spread evenly. Prioritize the countries and languages worth going deeper on.",
  });

  if (weakLocales.length) {
    ideas.push({
      title: zh ? "先补强已有语言，通常比继续扩新市场更划算" : "Strengthening current languages may beat adding new markets",
      summary: zh ? `${weakLocales.map((item) => item.locale).join("、")} 这类语言还没有真正站稳。` : `${weakLocales.map((item) => item.locale).join(", ")} still look too weak to treat as complete.`,
      nextStep: zh ? "先把这些语言做完整，再继续扩，会更稳也更省心。" : "Finish these languages first before pushing broader expansion.",
    });
  }

  if (sharedUrlMarkets.length >= 4) {
    ideas.push({
      title: zh ? "重点国家更适合有自己的入口" : "Top markets deserve their own entry points",
      summary: zh ? "现在仍有不少市场在跟随主站入口，这会影响本地感和国际 SEO 的放大效果。" : "A large share of markets still rely on the main storefront entry, which can limit local feel and SEO lift.",
      nextStep: zh ? "先挑转化高或搜索量高的国家做子目录或独立域名。" : "Start by giving the highest-opportunity markets their own subfolder or dedicated domain path.",
    });
  }

  if (sharedCurrencyMarkets.length) {
    ideas.push({
      title: zh ? "多国市场要同时看语言、货币和定价" : "Mixed-country markets need language, currency, and pricing together",
      summary: zh ? "多国共用一个市场时，运营上省事，但顾客体验不一定足够本地。" : "Operationally, one market can be easier to manage, but it can feel less local to buyers.",
      nextStep: zh ? "把高价值国家优先拆出来，给更清晰的货币和网址策略。" : "Split out the highest-value countries first for clearer pricing and local experience.",
    });
  }

  if (multilingualMarkets.length) {
    ideas.push({
      title: zh ? "多语言国家更要重视默认语言" : "Multilingual countries need sharper default-language choices",
      summary: zh ? "像加拿大、比利时这类市场，默认语言顺序会直接影响顾客第一眼体验和搜索表现。" : "In multilingual countries, the default language choice influences both buyer clarity and SEO.",
      nextStep: zh ? "默认语言先给主流客群，其他语言作为补充入口。" : "Use the dominant buyer language as default and keep the others as supporting paths.",
    });
  }

  if (localeSet.has("de") || localeSet.has("fr") || localeSet.has("it") || localeSet.has("es") || localeSet.has("nl")) {
    ideas.push({
      title: zh ? "欧洲市场更适合继续做深" : "Europe usually rewards deeper localization",
      summary: zh ? "既然已经覆盖多种欧洲语言，接下来更值得补的是政策、退货承诺、配送时效和本地入口，而不只是继续加更多国家。" : "Once several European languages are live, the next gains often come from policies, returns, delivery promises, and stronger local entry points rather than just adding more countries.",
      nextStep: zh ? "先把几个核心欧洲市场做扎实，再考虑继续外扩。" : "Deepen the strongest European markets before adding more edge cases.",
    });
  }

  if (localeSet.has("ja") || localeSet.has("ko")) {
    ideas.push({
      title: zh ? "东亚市场更吃完整度和信任感" : "East Asia usually rewards polish and trust signals",
      summary: zh ? "日语、韩语市场往往不只是商品页翻译，配送、退货、客服承诺和币种体验也很关键。" : "For Japanese and Korean markets, policy clarity and checkout confidence often matter as much as product translation.",
      nextStep: zh ? "优先补当地语言政策页、配送承诺和移动端路径。" : "Prioritize local-language policies, delivery promises, and mobile navigation.",
    });
  }

  return ideas.slice(0, 8);
}

function buildReportModel(audit) {
  const fixPlan = Array.isArray(audit.fixPlan)
    ? { actions: audit.fixPlan, explanation: "" }
    : (audit.fixPlan || { actions: [], explanation: "" });
  const fixNow = groupFindings(audit.findings, "fix-now");
  const tidyNext = groupFindings(audit.findings, "tidy-next");
  const manualChecks = groupFindings(audit.findings, "manual");
  const lang = audit.reportLang || "zh-CN";
  const zh = lang.toLowerCase().startsWith("zh");
  const localeCoverageMap = new Map(audit.localeCoverage.map((entry) => [entry.locale, entry]));
  const localeAssignments = new Map();
  for (const market of audit.markets) {
    for (const locale of market.allLocales) {
      if (!localeAssignments.has(locale)) localeAssignments.set(locale, []);
      localeAssignments.get(locale).push(market.name);
    }
  }

  const marketsWithCountries = audit.markets.filter((market) => market.countryCodes.length > 0);
  const shippingGapMarkets = marketsWithCountries.filter((market) => market.countryCodes.some((code) => !audit.shippingCountryCodes.includes(code)));
  const coveredMarkets = marketsWithCountries.length - shippingGapMarkets.length;
  const weakLocales = audit.localeCoverage.filter((entry) => entry.readinessPct < 70);
  const cleanupLocales = audit.localeCoverage.filter((entry) => entry.readinessPct >= 70 && (entry.readinessPct < 90 || entry.outdated > 0));
  const strongLocales = audit.localeCoverage.filter((entry) => entry.readinessPct >= 90 && entry.outdated === 0);
  const marketsMissingWebPresence = audit.markets.filter((market) => !market.webPresenceId);
  const marketsWithDedicatedWeb = audit.markets.filter((market) => market.webPresenceId);
  const sharedCurrencyMarkets = audit.markets.filter((market) => !market.localCurrencies && market.countryCodes.length > 1);
  const dynamicCurrencyMarkets = audit.markets.filter((market) => market.localCurrencies);
  const hiddenLocaleIssues = audit.markets.flatMap((market) => market.allLocales
    .map((localeCode) => ({ market: market.name, localeCode, locale: audit.shopLocales.find((item) => item.locale === localeCode) || null }))
    .filter((entry) => !entry.locale || !entry.locale.published));

  let score = 100;
  score -= Math.min(weakLocales.length * 14, 28);
  score -= Math.min(shippingGapMarkets.length * 18, 36);
  score -= Math.min(hiddenLocaleIssues.length * 12, 24);
  score -= Math.min(sharedCurrencyMarkets.length * 4, 12);
  if (!audit.storefront.canonical) score -= 8;
  if (audit.localeCoverage.length > 0 && audit.storefront.hreflangCount === 0) score -= 8;
  if (marketsMissingWebPresence.length > Math.max(3, Math.floor(audit.markets.length * 0.5))) score -= 6;
  score = Math.max(42, score);

  const strengthCards = [
    {
      tone: "good",
      title: zh ? "配送覆盖" : "Shipping coverage",
      value: `${coveredMarkets}/${marketsWithCountries.length || 0}`,
      detail: zh ? "市场里的国家是否都在配送覆盖内" : "Markets whose countries are covered by shipping",
      note: shippingGapMarkets.length
        ? (zh ? `${shippingGapMarkets.length} 个市场还有配送缺口` : `${shippingGapMarkets.length} markets still have shipping gaps`)
        : (zh ? "目前没有明显配送缺口" : "No obvious shipping gaps found"),
      chips: shippingGapMarkets.length ? takeLabels(shippingGapMarkets.map((market) => market.name)) : [],
    },
    {
      tone: "good",
      title: zh ? "语言上线情况" : "Published languages",
      value: `${audit.shopLocales.filter((item) => item.published).length}/${audit.shopLocales.length || 0}`,
      detail: zh ? "已发布并对顾客可见的语言数" : "Languages visible to buyers",
      note: weakLocales.length
        ? (zh ? `${weakLocales.length} 个语言还没准备好` : `${weakLocales.length} languages still look weak`)
        : (zh ? "大部分语言已经对外可用" : "Most languages are already live"),
      chips: takeLabels(audit.shopLocales.filter((item) => item.published).map((item) => item.locale)),
    },
    {
      tone: "good",
      title: zh ? "网址本地化" : "Localized URLs",
      value: `${marketsWithDedicatedWeb.length}/${audit.markets.length || 0}`,
      detail: zh ? "有单独入口的市场数" : "Markets with dedicated URL entry points",
      note: marketsMissingWebPresence.length
        ? (zh ? `${marketsMissingWebPresence.length} 个市场仍跟随主站入口` : `${marketsMissingWebPresence.length} markets still share the main storefront entry`)
        : (zh ? "重点市场已经有自己的入口" : "Key markets already have their own entry points"),
      chips: takeLabels(marketsWithDedicatedWeb.map((market) => market.name)),
    },
    {
      tone: "good",
      title: zh ? "搜索引擎识别" : "Search signals",
      value: `${audit.storefront.canonical ? 1 : 0}/${audit.localeCoverage.length > 0 ? 2 : 1}`,
      detail: zh ? "canonical 和 hreflang 基础信号" : "Canonical and hreflang basics",
      note: audit.storefront.canonical
        ? (audit.storefront.hreflangCount > 0 || audit.localeCoverage.length === 0
          ? (zh ? "主页关键 SEO 信号基本齐了" : "The homepage exposes the main localization signals")
          : (zh ? "canonical 有了，但 hreflang 还没补齐" : "Canonical is present, but hreflang still needs work"))
        : (zh ? "主页还缺少关键 SEO 信号" : "The homepage is still missing a key SEO signal"),
      chips: audit.storefront.hreflangCount ? [zh ? `${audit.storefront.hreflangCount} 条 hreflang` : `${audit.storefront.hreflangCount} hreflang links`] : [],
    },
  ];

  const priorityCards = uniqueStrings([
    weakLocales.length ? "weak-locales" : "",
    shippingGapMarkets.length ? "shipping-gaps" : "",
    hiddenLocaleIssues.length ? "hidden-locales" : "",
    (!audit.storefront.canonical || (audit.localeCoverage.length > 0 && audit.storefront.hreflangCount === 0)) ? "seo-signals" : "",
  ]).map((key) => {
    if (key === "weak-locales") {
      return {
        tone: "bad",
        title: zh ? "翻译准备度偏低" : "Translation readiness is too low",
        value: `${weakLocales.length}`,
        detail: zh ? "这些语言现在还不适合当成已完成市场" : "These languages are not ready to be treated as complete",
        note: zh ? "先补这些语言，再谈继续扩新市场会更稳。" : "Strengthen these languages before expanding further.",
        chips: takeLabels(weakLocales.map((entry) => entry.locale)),
      };
    }
    if (key === "shipping-gaps") {
      return {
        tone: "bad",
        title: zh ? "有市场缺配送覆盖" : "Some markets lack shipping coverage",
        value: `${shippingGapMarkets.length}`,
        detail: zh ? "市场已开，但国家还没完全落到配送区" : "The market exists, but some countries still lack shipping-zone coverage",
        note: zh ? "这类问题会直接影响顾客下单体验。" : "This directly affects whether people can buy smoothly.",
        chips: takeLabels(shippingGapMarkets.map((market) => market.name)),
      };
    }
    if (key === "hidden-locales") {
      return {
        tone: "bad",
        title: zh ? "市场挂了还没公开的语言" : "A market points to a hidden language",
        value: `${hiddenLocaleIssues.length}`,
        detail: zh ? "语言存在，但顾客还看不到，或者语言还没真的启用" : "The language exists on paper but is not fully live for buyers",
        note: zh ? "先把语言启用并发布，再继续调整市场。" : "Enable and publish the language before refining the market.",
        chips: takeLabels(hiddenLocaleIssues.map((entry) => `${entry.market} · ${entry.localeCode}`)),
      };
    }
    return {
      tone: "bad",
      title: zh ? "搜索信号还没补齐" : "Storefront search signals need work",
      value: `${Number(!audit.storefront.canonical) + Number(audit.localeCoverage.length > 0 && audit.storefront.hreflangCount === 0)}`,
      detail: zh ? "这会影响搜索引擎识别不同语言页面" : "Search engines may not understand the localized storefront cleanly",
      note: zh ? "先补 canonical 和 hreflang，再谈国际 SEO 放大。" : "Fix canonical and hreflang before pushing harder on international SEO.",
      chips: uniqueStrings([
        !audit.storefront.canonical ? "canonical" : "",
        audit.localeCoverage.length > 0 && audit.storefront.hreflangCount === 0 ? "hreflang" : "",
      ]),
    };
  });

  const improveCards = [
    {
      tone: "warn",
      title: zh ? "还没做独立入口的市场" : "Markets still sharing the main storefront",
      value: `${marketsMissingWebPresence.length}`,
      detail: zh ? "不是错误，但本地感和 SEO 往往会弱一些" : "Not always wrong, but usually less local and weaker for SEO",
      note: zh ? "优先把重点国家做成子目录或独立域名入口。" : "Give the highest-value markets their own URL path first.",
      chips: takeLabels(marketsMissingWebPresence.map((market) => market.name)),
    },
    {
      tone: "warn",
      title: zh ? "多国共用单一币种" : "Several countries share one fixed currency",
      value: `${sharedCurrencyMarkets.length}`,
      detail: zh ? "这会让价格体验没那么本地化" : "This can make pricing feel less local",
      note: zh ? "重点看多国市场，不要只盯单国市场。" : "Prioritize the multi-country markets here.",
      chips: takeLabels(sharedCurrencyMarkets.map((market) => market.name)),
    },
    {
      tone: "warn",
      title: zh ? "语言还要补细节" : "Some languages still need cleanup",
      value: `${cleanupLocales.length}`,
      detail: zh ? "不是不能上线，而是还不够完整" : "These are usable, but not polished yet",
      note: zh ? "把剩余缺口补齐，顾客体验会更统一。" : "Closing the remaining gaps will make the store feel more complete.",
      chips: takeLabels(cleanupLocales.map((entry) => entry.locale)),
    },
    {
      tone: "warn",
      title: zh ? "政策页入口还可以更明显" : "Policy visibility can still improve",
      value: `${audit.storefront.policyLinks.length > 0 ? 0 : 1}`,
      detail: zh ? "前端是否能轻松找到配送、退货、隐私说明" : "Whether shoppers can clearly reach shipping, returns, and privacy information",
      note: audit.storefront.policyLinks.length > 0
        ? (zh ? "首页已经能看到一些政策入口。" : "The homepage already exposes some policy links.")
        : (zh ? "建议把政策入口固定放在 footer。" : "A fixed footer policy area would be safer."),
      chips: audit.storefront.policyLinks.length ? takeLabels(audit.storefront.policyLinks, 2) : [],
    },
  ].filter((card) => card.value !== "0" || card.chips.length);

  const marketRows = audit.markets.map((market) => ({
    name: market.name,
    countriesLabel: zh ? `${market.countryCodes.length} 个国家` : `${market.countryCodes.length} countries`,
    languageLabel: market.allLocales.length
      ? market.allLocales.join(", ")
      : (zh ? "跟随主站默认语言" : "Uses the main storefront language"),
    currencyLabel: buildMarketCurrencyLabel(market, zh),
    webLabel: buildMarketUrlLabel(market, zh),
  }));

  const storefrontReminders = zh ? [
    {
      title: "顺手检查前端是否有国家/语言切换器",
      summary: "这项在不同主题里差异很大，这份报告不再给它做自动判定。",
      nextStep: "打开首页和移动端菜单，确认顾客能方便切换国家和语言。"
    },
    {
      title: "顺手检查后台是否开启自动定向",
      summary: "这项在 Shopify 后台里管理，这份报告不再把它当成可精准读取的配置项。",
      nextStep: "到 Online Store > Preferences 里确认自动定向设置。"
    }
  ] : [
    {
      title: "Check whether the storefront has a clear country or language switcher",
      summary: "This report no longer treats selector visibility as a reliable automated pass/fail result.",
      nextStep: "Open the storefront and confirm shoppers can switch country and language easily."
    },
    {
      title: "Check whether automatic redirection is turned on in Shopify admin",
      summary: "This report no longer treats automatic redirection as a precise machine-readable setting.",
      nextStep: "Open Online Store > Preferences and confirm the automatic redirection settings."
    }
  ];

  return {
    title: zh ? `${audit.shop.name} 国际化审计报告` : `Markets and language audit for ${audit.shop.name}`,
    summaryText: zh
      ? "这份报告重点看语言、市场、配送、网址策略和国际 SEO 基础有没有真正落地。"
      : "This report checks whether shoppers are getting the right language, the right market setup, and a clear local buying experience.",
    shop: {
      name: audit.shop.name,
      domain: audit.shop.primaryDomain?.host || audit.shop.myshopifyDomain,
    },
    generatedAtLabel: new Date(audit.generatedAt).toLocaleString(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }),
    score,
    scoreText: zh
      ? (score >= 85 ? "整体基础不错，剩下主要是补细节。" : score >= 65 ? "整体可用，但还有几块需要补齐。" : "国际化基础还不够稳，建议先补核心短板。")
      : (score >= 85 ? "The setup is in good shape, with a few improvements left." : score >= 65 ? "The store is workable, but several areas need attention." : "The store needs cleanup before the international setup feels reliable."),
    languageCount: audit.localeCoverage.length,
    languageCountText: zh ? "本次检查的语言数" : "Checked in this run",
    marketCount: audit.markets.length,
    marketCountText: zh ? "本次检查的市场数" : "Active market structures reviewed",
    fixCount: (fixPlan.actions || []).length,
    fixCountText: zh ? "可预览的安全修复" : "Safe approval-based fixes ready",
    bigPicture: zh
      ? (fixNow.length ? "这家店已经有比较完整的国际化底子，但现在的短板主要集中在翻译扎实度、部分市场入口策略，以及少数市场的配置细节。" : "这家店的国际化基础已经搭起来了，剩下主要是把重点市场做得更本地、更清楚。")
      : (fixNow.length ? "The store already has the building blocks for selling internationally, but some important gaps are still blocking a clean local experience." : "The foundation is solid. Most of the work left is polish and structure cleanup."),
    goodCount: strengthCards.filter((card) => Number.parseInt(card.value, 10) !== 0 || card.chips.length).length,
    fixNowCount: priorityCards.length,
    tidyCount: improveCards.length,
    strengthCards,
    priorityCards,
    improveCards,
    manualCards: storefrontReminders,
    languagesIntro: zh ? "这里不再展开几百条文字明细，而是给每个语言一个整体准备度。这个值基于本次纳入检查的资源计算。" : "Each language gets one readiness score based on the resources included in this audit run.",
    localeRows: audit.localeCoverage.map((entry) => ({
      locale: entry.locale,
      statusLabel: buildLocaleStatusLabel(audit.shopLocales.find((item) => item.locale === entry.locale) || { primary: false, published: false }, zh),
      readinessLabel: zh ? `${entry.readinessPct}% 准备度` : `${entry.readinessPct}% readiness`,
      assignedMarketsLabel: localeAssignments.has(entry.locale)
        ? localeAssignments.get(entry.locale).join(" / ")
        : (zh ? "还没分配到市场" : "Not attached to a market yet"),
    })),
    marketsIntro: zh ? "这里会看每个市场的国家分组、语言、货币和网址策略。" : "Markets are reviewed for language setup, country grouping, money setup, and URL strategy.",
    marketRows,
    shippingIntro: zh ? "配送这里不列碎项，直接看市场覆盖结果。" : "Shipping is summarized at the market level instead of listing every small finding.",
    shippingCards: [
      {
        tone: shippingGapMarkets.length ? "bad" : "good",
        title: zh ? "市场配送覆盖" : "Market shipping coverage",
        value: `${coveredMarkets}/${marketsWithCountries.length || 0}`,
        detail: zh ? "已经完全覆盖配送的市场数" : "Markets fully covered by shipping",
        note: shippingGapMarkets.length
          ? (zh ? "这些市场需要补配送覆盖或调整国家范围。" : "These markets need shipping coverage or a tighter country list.")
          : (zh ? "这块目前没有明显问题。" : "No obvious issue here."),
        chips: shippingGapMarkets.length ? takeLabels(shippingGapMarkets.map((market) => market.name)) : [],
      },
    ],
    storefrontIntro: zh ? "这里看的是顾客真实会看到的入口和搜索信号。" : "These checks focus on what buyers and search engines can actually see.",
    storefrontCards: [
      {
        tone: audit.storefront.canonical ? "good" : "bad",
        title: zh ? "Canonical" : "Canonical",
        value: audit.storefront.canonical ? (zh ? "已发现" : "Found") : (zh ? "缺失" : "Missing"),
        detail: zh ? "主页主链接信号" : "Homepage canonical signal",
        note: audit.storefront.canonical
          ? (zh ? "主页有 canonical。" : "The homepage exposes a canonical link.")
          : (zh ? "主页没看到 canonical。" : "No canonical link was found on the homepage."),
        chips: audit.storefront.canonical ? [audit.storefront.canonical] : [],
      },
      {
        tone: audit.storefront.hreflangCount > 0 || audit.localeCoverage.length === 0 ? "good" : "bad",
        title: zh ? "Hreflang" : "Hreflang",
        value: `${audit.storefront.hreflangCount || 0}`,
        detail: zh ? "主页暴露给搜索引擎的语言链接数" : "Homepage alternate-language links",
        note: audit.storefront.hreflangCount > 0
          ? (zh ? "搜索引擎已经能看到多语言入口。" : "Search engines can already see alternate language paths.")
          : (zh ? "主页还没暴露多语言入口。" : "The homepage is not exposing alternate language paths yet."),
        chips: takeLabels((audit.storefront.hreflangs || []).map((entry) => entry.locale), 8),
      },
      {
        tone: audit.storefront.policyLinks.length > 0 ? "good" : "warn",
        title: zh ? "政策页入口" : "Policy links",
        value: `${audit.storefront.policyLinks.length || 0}`,
        detail: zh ? "首页可见的政策相关入口" : "Policy-related homepage links",
        note: audit.storefront.policyLinks.length > 0
          ? (zh ? "顾客已经能从前端找到一些政策内容。" : "Some policy links are visible on the storefront.")
          : (zh ? "建议让配送、退货、隐私入口更明显。" : "Policy visibility could be clearer from the storefront."),
        chips: takeLabels(audit.storefront.policyLinks, 3),
      },
    ],
    expansionIntro: zh ? "这部分不是在找 bug，而是在给国际化经营上的建议。" : "These are growth ideas, not bugs.",
    expansionIdeas: buildExpansionIdeasFromAudit(audit, zh),
    actionsIntro: zh ? "这些动作可以先预览，确认后再执行。" : "These fixes are safe to preview now and execute later only after approval.",
    actions: fixPlan.actions || [],
    actionsEmptyNote: fixPlan.explanation || "",
    storefrontReminders,
    footerNote: zh
      ? "前端切换器和自动定向这两项不再计分，只作为低优先级人工提醒。"
      : "Selector visibility and automatic redirection are no longer scored and are shown only as low-priority manual reminders.",
    lang,
  };
}

async function cmdAudit(args) {
  const env = await loadEnv(args.env);
  const raw = await graphql(env, OVERVIEW_QUERY);
  const overview = normalizeOverview(raw);
  const requestedLocales = parseLocales(args.locales);
  const localesToAudit = chooseLocalesForAudit(overview, requestedLocales);

  const localeCoverage = [];
  for (const locale of localesToAudit) {
    console.error(`[audit] Computing locale readiness for ${locale}...`);
    localeCoverage.push(await computeLocaleCoverage(env, locale, DEFAULT_RESOURCE_TYPES));
  }

  const storefront = await crawlStorefront(overview.shop);
  const { findings, workingWell } = buildFindings(overview, localeCoverage, storefront);
  overview.reportLang = args.lang === "auto" ? "zh-CN" : args.lang;
  const fixPlan = buildFixPlan(overview, localeCoverage);

  const audit = {
    generatedAt: new Date().toISOString(),
    shop: overview.shop,
    shopLocales: overview.shopLocales,
    markets: overview.markets,
    deliveryProfiles: overview.deliveryProfiles,
    shippingCountryCodes: overview.shippingCountryCodes,
    storefront,
    storeProfile: overview.storeProfile,
    localeCoverage,
    findings,
    workingWell,
    fixPlan,
    reportLang: args.lang === "auto" ? "zh-CN" : args.lang,
  };

  await writeJsonOutput(audit, args.output);
}

async function renderReport(audit, outputPath) {
  const templatePath = path.join(__dirname, "..", "assets", "report-template.html");
  const template = await readFile(templatePath, "utf8");
  const reportModel = buildReportModel(audit);
  const html = template
    .replaceAll("{{REPORT_TITLE}}", reportModel.title.replace(/</g, "&lt;"))
    .replace("{{REPORT_DATA_JSON}}", JSON.stringify(reportModel));
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, html, "utf8");
}

async function cmdReport(args) {
  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");
  const audit = JSON.parse(await readFile(args.input, "utf8"));
  audit.reportLang = args.lang === "auto" ? (audit.reportLang || "zh-CN") : args.lang;
  await renderReport(audit, args.output);
  console.log(JSON.stringify({ ok: true, output: args.output }, null, 2));
}

async function cmdFixPlan(args) {
  if (!args.input) throw new Error("--input is required");
  const audit = JSON.parse(await readFile(args.input, "utf8"));
  await writeJsonOutput(audit.fixPlan?.actions || [], args.output);
}

async function applyAction(env, action) {
  if (action.type === "enable_publish_locale") {
    await graphql(env, `#graphql
      mutation EnableLocale($locale: String!) {
        shopLocaleEnable(locale: $locale) {
          userErrors { field message }
        }
      }`, { locale: action.variables.locale });

    return graphql(env, `#graphql
      mutation PublishLocale($locale: String!) {
        shopLocaleUpdate(locale: $locale, shopLocale: { published: true }) {
          userErrors { field message }
        }
      }`, { locale: action.variables.locale });
  }

  if (action.type === "publish_locale") {
    return graphql(env, `#graphql
      mutation PublishLocale($locale: String!) {
        shopLocaleUpdate(locale: $locale, shopLocale: { published: true }) {
          userErrors { field message }
        }
      }`, { locale: action.variables.locale });
  }

  if (action.type === "enable_local_currencies") {
    return graphql(env, `#graphql
      mutation EnableLocalCurrencies($id: ID!) {
        marketUpdate(id: $id, input: { currencySettings: { localCurrencies: true } }) {
          userErrors { field message }
        }
      }`, { id: action.variables.marketId });
  }

  throw new Error(`Unsupported action type: ${action.type}`);
}

async function cmdApply(args) {
  if (!args.input) throw new Error("--input is required");
  const parsed = JSON.parse(await readFile(args.input, "utf8"));
  const actions = Array.isArray(parsed) ? parsed : (parsed.actions || []);
  if (!args.execute) {
    console.log(JSON.stringify({
      mode: "preview",
      count: actions.length,
      actions: actions.map((action) => ({
        title: action.title,
        summary: action.summary,
        executeSupported: action.executeSupported,
      })),
    }, null, 2));
    return;
  }

  const env = await loadEnv(args.env);
  const results = [];
  for (const action of actions) {
    if (!action.executeSupported) {
      results.push({ title: action.title, status: "SKIPPED", reason: "execute not supported" });
      continue;
    }
    try {
      await applyAction(env, action);
      results.push({ title: action.title, status: "OK" });
    } catch (error) {
      results.push({ title: action.title, status: "ERROR", error: error.message });
    }
  }
  console.log(JSON.stringify({ mode: "execute", results }, null, 2));
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const commands = {
  "help": () => printHelp(),
  "init-env": () => initEnv(args),
  "connection-check": () => cmdConnectionCheck(args),
  "audit": () => cmdAudit(args),
  "report": () => cmdReport(args),
  "fix-plan": () => cmdFixPlan(args),
  "apply": () => cmdApply(args),
};

Promise.resolve(commands[args.command]()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
