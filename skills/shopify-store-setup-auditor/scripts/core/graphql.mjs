import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { connectionReadiness, safeError } from "./config.mjs";

const execFileAsync = promisify(execFile);
const devDashboardTokenCache = new Map();

export class ShopifyGraphqlError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}

export async function resolveCli(config) {
  const explicit = String(config.SKILL_HUB_SHOPIFY_CLI_JS || "").trim();
  const npmRoot = await execFileAsync("npm", ["root", "-g"], { windowsHide: true }).then(({ stdout }) => stdout.trim()).catch(() => "");
  const candidates = [explicit, npmRoot && path.join(npmRoot, "@shopify", "cli", "bin", "run.js")].filter(Boolean);
  for (const candidate of candidates) {
    if (await access(candidate).then(() => true).catch(() => false)) return { command: process.execPath, prefix: [candidate] };
  }
  await execFileAsync("shopify", ["version"], { windowsHide: true }).catch(() => {
    throw new ShopifyGraphqlError("CLI_NOT_FOUND", "Install Shopify CLI or configure SKILL_HUB_SHOPIFY_CLI_JS.");
  });
  return { command: "shopify", prefix: [] };
}

export async function runShopifyCli(config, args, { env = process.env, timeout = 180000 } = {}) {
  const cli = await resolveCli(config);
  return execFileAsync(cli.command, [...cli.prefix, ...args], { env, windowsHide: true, timeout, maxBuffer: 20 * 1024 * 1024 });
}

async function cliRequest(config, query, variables, mutation) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "store-setup-auditor-"));
  try {
    const queryFile = path.join(tempDir, "query.graphql");
    const variableFile = path.join(tempDir, "variables.json");
    const outputFile = path.join(tempDir, "output.json");
    await Promise.all([writeFile(queryFile, query, "utf8"), writeFile(variableFile, JSON.stringify(variables), "utf8")]);
    const args = ["store", "execute", "--store", config.storeInput, "--query-file", queryFile, "--variable-file", variableFile, "--output-file", outputFile, "--json", "--no-color"];
    if (mutation) args.push("--allow-mutations");
    try {
      await runShopifyCli(config, args);
    } catch (error) {
      const diagnostic = safeError([error.stderr, error.stdout, error.message].filter(Boolean).join(" "));
      const code = /access denied|forbidden|scope/i.test(diagnostic) ? "CLI_ACCESS_DENIED" : /auth|authorize|login/i.test(diagnostic) ? "CLI_AUTH_REQUIRED" : "CLI_SPAWN_FAILED";
      throw new ShopifyGraphqlError(code, diagnostic);
    }
    const text = await readFile(outputFile, "utf8").catch(() => { throw new ShopifyGraphqlError("CLI_OUTPUT_MISSING", "Shopify CLI did not create its JSON output file."); });
    const result = JSON.parse(text);
    if (result.errors?.length) throw new ShopifyGraphqlError("CLI_GRAPHQL_ERRORS", JSON.stringify(result.errors));
    return result.data || result;
  } catch (error) {
    if (error instanceof SyntaxError) throw new ShopifyGraphqlError("CLI_JSON_PARSE_FAILED", "Shopify CLI output was not valid JSON.");
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function tokenRequest(config, query, variables) {
  const host = { host: config.storeInput, apiVersion: config.apiVersion };
  const token = await devDashboardToken(config);
  const response = await fetch(`https://${host.host}/admin/api/${host.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = response.status === 401 ? "AUTH_REQUIRED" : response.status === 403 ? "ACCESS_DENIED" : "GRAPHQL_HTTP_FAILED";
    throw new ShopifyGraphqlError(code, `Shopify returned HTTP ${response.status}.`);
  }
  if (body.errors?.length) throw new ShopifyGraphqlError("GRAPHQL_ERRORS", JSON.stringify(body.errors));
  return { data: body.data, host };
}

async function devDashboardToken(config) {
  const key = `${config.storeInput}:${config.SKILL_HUB_SHOPIFY_CLIENT_ID}`;
  const cached = devDashboardTokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetch(`https://${config.storeInput}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.SKILL_HUB_SHOPIFY_CLIENT_ID, client_secret: config.SKILL_HUB_SHOPIFY_CLIENT_SECRET }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token || !body.expires_in) {
    const code = response.status === 401 || response.status === 403 ? "DEV_DASHBOARD_CREDENTIALS_INVALID" : "DEV_DASHBOARD_TOKEN_REQUEST_FAILED";
    throw new ShopifyGraphqlError(code, "Shopify could not issue a temporary Dev Dashboard access token.");
  }
  devDashboardTokenCache.set(key, { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in) * 1000 });
  return body.access_token;
}

export async function shopifyGraphql(config, query, variables = {}, { mutation = false } = {}) {
  const readiness = connectionReadiness(config);
  if (!readiness.ready) throw new ShopifyGraphqlError("CONNECTION_INCOMPLETE", readiness.reason);
  if (config.accessMethod === "shopify_cli_oauth") return { data: await cliRequest(config, query, variables, mutation), host: { host: config.storeInput, apiVersion: config.apiVersion } };
  return tokenRequest(config, query, variables);
}

export async function safeShopifyRead(config, query, variables = {}) {
  try {
    const result = await shopifyGraphql(config, query, variables);
    return { available: true, ...result };
  } catch (error) {
    return { available: false, code: error.code || "READ_FAILED", error: safeError(error) };
  }
}
