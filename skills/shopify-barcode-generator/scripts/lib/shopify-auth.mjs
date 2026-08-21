import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const tokenCache = new Map();
const CONFIG_KEYS = ["SKILL_HUB_SHOPIFY_ACCESS_METHOD", "SKILL_HUB_SHOPIFY_STORE_DOMAIN", "SKILL_HUB_SHOPIFY_CLIENT_ID", "SKILL_HUB_SHOPIFY_CLIENT_SECRET", "SKILL_HUB_SHOPIFY_CLI_JS", "SKILL_HUB_SHOPIFY_API_VERSION"];

export function parseEnv(text) {
  const values = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator > 0) values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

export function normalizeMyShopifyDomain(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/admin\.shopify\.com\/store\/([^/\s?&]+)/i);
  const domain = (match ? `${match[1]}.myshopify.com` : raw).replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  if (!/^[a-z0-9][-a-z0-9]*\.myshopify\.com$/i.test(domain)) throw new Error("INVALID_STORE_DOMAIN: provide a .myshopify.com domain or Shopify admin URL.");
  return domain;
}

export async function loadShopifyConfig(envPath) {
  const fileEnv = await readFile(envPath, "utf8").then(parseEnv).catch(() => ({}));
  const env = { ...fileEnv };
  for (const key of CONFIG_KEYS) if (process.env[key]?.trim()) env[key] = process.env[key].trim();
  const accessMethod = env.SKILL_HUB_SHOPIFY_ACCESS_METHOD || "shopify_cli_oauth";
  if (!['shopify_cli_oauth', 'dev_dashboard_client_credentials'].includes(accessMethod)) throw new Error("INVALID_ACCESS_METHOD: use shopify_cli_oauth or dev_dashboard_client_credentials.");
  if (!env.SKILL_HUB_SHOPIFY_STORE_DOMAIN) throw new Error(`STORE_DOMAIN_REQUIRED: add SKILL_HUB_SHOPIFY_STORE_DOMAIN to ${envPath}.`);
  return { ...env, SKILL_HUB_SHOPIFY_ACCESS_METHOD: accessMethod, SHOPIFY_STORE_DOMAIN: normalizeMyShopifyDomain(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN), SHOPIFY_API_VERSION: env.SKILL_HUB_SHOPIFY_API_VERSION || "2026-07" };
}

function assertScopes(granted, required) {
  const available = new Set(granted || []);
  const missing = required.filter((scope) => !available.has(scope));
  if (missing.length) throw new Error(`SCOPE_UPDATE_REQUIRED: missing ${missing.join(",")}. Approve exactly these scopes, complete the Shopify permission update, then retry.`);
}

async function directToken(env) {
  const clientId = String(env.SKILL_HUB_SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SKILL_HUB_SHOPIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("DEV_DASHBOARD_CREDENTIALS_REQUIRED: set Client ID and Client Secret in private skill-hub.env, or use quick browser connection.");
  const key = `${env.SHOPIFY_STORE_DOMAIN}:${clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached;
  const response = await fetch(`https://${env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token || !payload.expires_in) throw new Error(`DEV_DASHBOARD_TOKEN_REQUEST_FAILED: ${payload.error_description || payload.error || `HTTP ${response.status}`}`);
  const token = { value: payload.access_token, scopes: String(payload.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean), expiresAt: Date.now() + Number(payload.expires_in) * 1000 };
  tokenCache.set(key, token);
  return token;
}

async function cliInvocation(env) {
  const candidates = [env.SKILL_HUB_SHOPIFY_CLI_JS];
  const npmRoot = await execFileAsync("npm", ["root", "-g"], { windowsHide: true }).then(({ stdout }) => stdout.trim()).catch(() => "");
  if (npmRoot) candidates.push(path.join(npmRoot, "@shopify", "cli", "bin", "run.js"));
  for (const candidate of candidates) if (candidate && await access(candidate).then(() => true).catch(() => false)) return { command: process.execPath, prefix: [candidate] };
  await execFileAsync("shopify", ["--version"], { windowsHide: true }).catch(() => { throw new Error("CLI_NOT_FOUND: install Shopify CLI 3.93.0+ or configure SKILL_HUB_SHOPIFY_CLI_JS."); });
  return { command: "shopify", prefix: [] };
}

async function cliGraphql(env, query, variables, mutation) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "shopify-barcode-generator-"));
  try {
    const [queryFile, variablesFile, outputFile] = ["query.graphql", "variables.json", "output.json"].map((name) => path.join(temp, name));
    await Promise.all([writeFile(queryFile, query, "utf8"), writeFile(variablesFile, JSON.stringify(variables || {}), "utf8")]);
    const cli = await cliInvocation(env);
    const args = [...cli.prefix, "store", "execute", "--store", env.SHOPIFY_STORE_DOMAIN, "--query-file", queryFile, "--variable-file", variablesFile, "--output-file", outputFile, "--json"];
    if (mutation) args.push("--allow-mutations");
    await execFileAsync(cli.command, args, { windowsHide: true, timeout: 180_000, maxBuffer: 20 * 1024 * 1024 }).catch((error) => { throw new Error(`CLI_GRAPHQL_FAILED: ${[error.stderr, error.stdout, error.message].filter(Boolean).join(" ")}`); });
    const result = JSON.parse(await readFile(outputFile, "utf8"));
    if (result.errors?.length) throw new Error(`CLI_GRAPHQL_ERRORS: ${JSON.stringify(result.errors)}`);
    return result.data || result;
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}

export async function shopifyGraphql(env, query, variables = {}, { mutation = false, requiredScopes = [] } = {}) {
  if (env.SKILL_HUB_SHOPIFY_ACCESS_METHOD === "shopify_cli_oauth") return cliGraphql(env, query, variables, mutation);
  const token = await directToken(env);
  assertScopes(token.scopes, requiredScopes);
  const response = await fetch(`https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.value }, body: JSON.stringify({ query, variables }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GRAPHQL_HTTP_FAILED: Shopify returned HTTP ${response.status}.`);
  if (payload.errors?.length) throw new Error(`GRAPHQL_ERRORS: ${JSON.stringify(payload.errors)}`);
  return payload.data;
}
