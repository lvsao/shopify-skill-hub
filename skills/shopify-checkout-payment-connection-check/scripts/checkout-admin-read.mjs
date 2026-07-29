#!/usr/bin/env node
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_ENV = "skill-hub.env";
const DEFAULT_API_VERSION = "2026-07";
const REQUIRED_SCOPES = ["read_orders", "read_shipping", "read_shopify_payments_accounts"];
const REQUIRED_STANDARD_SCOPES = ["read_orders", "read_shipping"];
const PAYMENT_SCOPE_ALTERNATIVES = ["read_shopify_payments_accounts", "read_shopify_payments"];
const tokenCache = new Map();

const SHOP_QUERY = `query CheckoutConnectionCheck { shop { id } }`;
const PAYMENT_SETUP_QUERY = `query PaymentSetup { shopifyPaymentsAccount { activated } }`;
const PAYMENT_SIGNALS_QUERY = `query PaymentSignals($first: Int!) {
  orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
    nodes {
      transactions(first: 20) { id kind status gateway errorCode }
    }
  }
}`;
const DELIVERY_QUERY = `query DeliveryCoverage {
  deliveryProfiles(first: 50, merchantOwnedOnly: true) {
    nodes {
      profileLocationGroups {
        locationGroupZones(first: 100) {
          nodes {
            zone { countries { code { countryCode restOfWorld } } }
            methodDefinitions(first: 100) { nodes { active description } }
          }
        }
      }
    }
  }
}`;

function usage() {
  console.log(`Usage:
  node checkout-admin-read.mjs onboarding
  node checkout-admin-read.mjs init-env --method <shopify_cli_oauth|dev_dashboard_client_credentials> --env skill-hub.env
  node checkout-admin-read.mjs connection-check --env skill-hub.env
  node checkout-admin-read.mjs collect --env skill-hub.env --out checkout-admin.json`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) { args._.push(value); continue; }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

function parseEnv(text) {
  const values = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function normalizeDomain(value) {
  const raw = String(value || "").trim();
  const adminMatch = raw.match(/admin\.shopify\.com\/store\/([^/\s?&]+)/i);
  const domain = (adminMatch ? `${adminMatch[1]}.myshopify.com` : raw)
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!/^[a-z0-9][-a-z0-9]*\.myshopify\.com$/i.test(domain)) {
    throw new Error("INVALID_STORE_DOMAIN: provide a .myshopify.com domain or Shopify admin URL.");
  }
  return domain;
}

async function loadConfig(envPath) {
  const fileValues = await readFile(envPath, "utf8").then(parseEnv).catch(() => ({}));
  const keys = [
    "SKILL_HUB_SHOPIFY_ACCESS_METHOD",
    "SKILL_HUB_SHOPIFY_STORE_DOMAIN",
    "SKILL_HUB_SHOPIFY_API_VERSION",
    "SKILL_HUB_SHOPIFY_CLIENT_ID",
    "SKILL_HUB_SHOPIFY_CLIENT_SECRET",
    "SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN",
    "SKILL_HUB_SHOPIFY_CLI_JS",
  ];
  const config = { ...fileValues };
  for (const key of keys) if (process.env[key]?.trim()) config[key] = process.env[key].trim();
  const accessMethod = config.SKILL_HUB_SHOPIFY_ACCESS_METHOD || "shopify_cli_oauth";
  if (!new Set(["shopify_cli_oauth", "dev_dashboard_client_credentials"]).has(accessMethod)) {
    throw new Error("INVALID_ACCESS_METHOD: use shopify_cli_oauth or dev_dashboard_client_credentials.");
  }
  return {
    ...config,
    accessMethod,
    storeDomain: normalizeDomain(config.SKILL_HUB_SHOPIFY_STORE_DOMAIN),
    apiVersion: config.SKILL_HUB_SHOPIFY_API_VERSION || DEFAULT_API_VERSION,
  };
}

function safeError(error) {
  const raw = String(error?.message || error || "Unknown error")
    .replace(/(access[_-]?token|client[_-]?secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]");
  return raw.slice(0, 500);
}

async function cliInvocation(config) {
  const explicit = String(config.SKILL_HUB_SHOPIFY_CLI_JS || "").trim();
  if (explicit) {
    const exists = await access(explicit).then(() => true).catch(() => false);
    if (!exists) throw new Error("CLI_NOT_FOUND: SKILL_HUB_SHOPIFY_CLI_JS does not point to a readable file.");
    return { command: process.execPath, prefix: [explicit] };
  }
  await execFileAsync("shopify", ["--version"], { windowsHide: true }).catch(() => {
    throw new Error("CLI_NOT_FOUND: install Shopify CLI 3.93.0+ or configure SKILL_HUB_SHOPIFY_CLI_JS.");
  });
  return { command: "shopify", prefix: [] };
}

async function cliGraphql(config, query, variables) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "checkout-connection-"));
  const queryFile = path.join(tempDir, "query.graphql");
  const variablesFile = path.join(tempDir, "variables.json");
  const outputFile = path.join(tempDir, "output.json");
  try {
    await writeFile(queryFile, query, "utf8");
    await writeFile(variablesFile, JSON.stringify(variables), "utf8");
    const cli = await cliInvocation(config);
    const args = [...cli.prefix, "store", "execute", "--store", config.storeDomain, "--query-file", queryFile, "--variable-file", variablesFile, "--output-file", outputFile, "--json"];
    await execFileAsync(cli.command, args, { windowsHide: true, timeout: 180000, maxBuffer: 20 * 1024 * 1024 }).catch(() => {
      throw new Error("CLI_GRAPHQL_FAILED: run Shopify browser authorization for the selected store and scopes, then retry.");
    });
    const result = JSON.parse(await readFile(outputFile, "utf8"));
    if (result.errors?.length) throw new Error("GRAPHQL_ERRORS: Shopify returned a GraphQL error.");
    return result.data || result;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function directToken(config) {
  const clientId = String(config.SKILL_HUB_SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(config.SKILL_HUB_SHOPIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("DEV_DASHBOARD_CREDENTIALS_REQUIRED: set the private Client ID and Client Secret for the selected direct connection.");
  const cacheKey = `${config.storeDomain}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;
  const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token || !payload.expires_in) throw new Error("DEV_DASHBOARD_TOKEN_REQUEST_FAILED: check the selected store, app installation, and private credentials.");
  const token = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in) * 1000,
    scopes: String(payload.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean),
  };
  tokenCache.set(cacheKey, token);
  return token;
}

function assertScopes(token) {
  const scopes = Array.isArray(token?.scopes) ? token.scopes : [];
  if (!scopes.length) return;
  const present = new Set(scopes);
  const hasScope = (scope) => present.has(scope)
    || (scope.startsWith("read_") && present.has(`write_${scope.slice("read_".length)}`));
  const missing = REQUIRED_STANDARD_SCOPES.filter((scope) => !hasScope(scope));
  if (!PAYMENT_SCOPE_ALTERNATIVES.some((scope) => present.has(scope))) {
    missing.push("one of read_shopify_payments_accounts or read_shopify_payments");
  }
  if (missing.length) throw new Error(`SCOPE_UPDATE_REQUIRED: missing ${missing.join(",")}.`);
}

async function graphql(config, query, variables = {}) {
  if (config.accessMethod === "shopify_cli_oauth") return cliGraphql(config, query, variables);
  const token = await directToken(config);
  assertScopes(token);
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.value },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GRAPHQL_HTTP_FAILED: Shopify returned HTTP ${response.status}.`);
  if (payload.errors?.length) throw new Error("GRAPHQL_ERRORS: Shopify returned a GraphQL error.");
  return payload.data;
}

async function readSafely(config, query, variables) {
  try { return { available: true, data: await graphql(config, query, variables) }; }
  catch (error) { return { available: false, error: safeError(error) }; }
}

function summarizeTransactions(data) {
  const byStatus = {};
  const byGateway = {};
  let sampledOrders = 0;
  let sampledTransactions = 0;
  for (const order of data?.orders?.nodes || []) {
    sampledOrders += 1;
    const transactions = Array.isArray(order.transactions)
      ? order.transactions
      : (order.transactions?.nodes || []);
    for (const transaction of transactions) {
      sampledTransactions += 1;
      const status = transaction.status || "UNKNOWN";
      const gateway = transaction.gateway || "UNSPECIFIED";
      byStatus[status] = (byStatus[status] || 0) + 1;
      const gatewaySummary = byGateway[gateway] || { total: 0, failures: 0, errors: 0, errorCodes: {} };
      gatewaySummary.total += 1;
      if (status === "FAILURE") gatewaySummary.failures += 1;
      if (status === "ERROR") gatewaySummary.errors += 1;
      if (transaction.errorCode) gatewaySummary.errorCodes[transaction.errorCode] = (gatewaySummary.errorCodes[transaction.errorCode] || 0) + 1;
      byGateway[gateway] = gatewaySummary;
    }
  }
  return { sampledOrders, sampledTransactions, byStatus, byGateway };
}

function summarizeDelivery(data) {
  const destinations = new Map();
  let profileCount = 0;
  for (const profile of data?.deliveryProfiles?.nodes || []) {
    profileCount += 1;
    for (const group of profile.profileLocationGroups || []) {
      for (const zone of group.locationGroupZones?.nodes || []) {
        const activeMethods = (zone.methodDefinitions?.nodes || []).filter((method) => method.active).length;
        for (const country of zone.zone?.countries || []) {
          const label = country.code?.restOfWorld ? "REST_OF_WORLD" : (country.code?.countryCode || "UNSPECIFIED");
          const previous = destinations.get(label) || { configuredZones: 0, activeMethodCount: 0 };
          previous.configuredZones += 1;
          previous.activeMethodCount += activeMethods;
          destinations.set(label, previous);
        }
      }
    }
  }
  return { profileCount, destinations: Object.fromEntries(destinations) };
}

async function initEnv(args) {
  const method = args.method || "shopify_cli_oauth";
  if (!new Set(["shopify_cli_oauth", "dev_dashboard_client_credentials"]).has(method)) throw new Error("INVALID_ACCESS_METHOD: use shopify_cli_oauth or dev_dashboard_client_credentials.");
  const envPath = args.env || DEFAULT_ENV;
  const template = envTemplate(method);
  let created = true;
  try { await writeFile(envPath, template, { encoding: "utf8", flag: "wx" }); }
  catch (error) { if (error?.code === "EEXIST") created = false; else throw error; }
  console.log(JSON.stringify({
    ok: true,
    created,
    accessMethod: method,
    requiredScopes: REQUIRED_SCOPES,
    nextStep: "Fill the private config, complete the selected authorization path, then run connection-check.",
  }, null, 2));
}

function envTemplate(method) {
  return `SKILL_HUB_SHOPIFY_ACCESS_METHOD=${method}\nSKILL_HUB_SHOPIFY_STORE_DOMAIN=\n# Optional Shopify Admin API version override:\n# SKILL_HUB_SHOPIFY_API_VERSION=${DEFAULT_API_VERSION}\n# Direct Dev Dashboard mode only:\n# SKILL_HUB_SHOPIFY_CLIENT_ID=\n# SKILL_HUB_SHOPIFY_CLIENT_SECRET=\n# Optional: only for approved permission releases; never a store API credential.\n# SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN=\n# Optional Shopify CLI JavaScript entrypoint if shopify is not on PATH:\n# SKILL_HUB_SHOPIFY_CLI_JS=\n`;
}

function onboarding() {
  console.log(JSON.stringify({
    privateConfig: "Create skill-hub.env in the working directory, never in the skill folder.",
    scopes: REQUIRED_SCOPES,
    quickConnection: "Use Shopify CLI browser authorization for the exact read-only scopes.",
    longRunningConnection: "Use an installed Dev Dashboard app with private Client ID and Client Secret.",
    safety: "The script is read-only and returns only redacted aggregate evidence.",
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help" || command === "--help") return usage();
  if (command === "onboarding") return onboarding();
  if (command === "init-env") return initEnv(args);
  const config = await loadConfig(args.env || DEFAULT_ENV);
  if (command === "connection-check") {
    const [shop, paymentSetup, paymentSignals, delivery] = await Promise.all([
      readSafely(config, SHOP_QUERY, {}),
      readSafely(config, PAYMENT_SETUP_QUERY, {}),
      readSafely(config, PAYMENT_SIGNALS_QUERY, { first: 1 }),
      readSafely(config, DELIVERY_QUERY, {}),
    ]);
    const unavailableChecks = [
      ["store connection", shop],
      ["payment setup", paymentSetup],
      ["payment history", paymentSignals],
      ["delivery configuration", delivery],
    ].filter(([, result]) => !result.available).map(([label]) => label);
    console.log(JSON.stringify({
      ok: unavailableChecks.length === 0,
      accessMethod: config.accessMethod,
      apiVersion: config.apiVersion,
      requiredScopes: REQUIRED_SCOPES,
      availableChecks: ["store connection", "payment setup", "payment history", "delivery configuration"].filter((label) => !unavailableChecks.includes(label)),
      unavailableChecks: unavailableChecks.length ? unavailableChecks : undefined,
      nextStep: unavailableChecks.length === 0 ? "Run collect, then complete the safe browser checkout walkthrough." : "Resolve the reported connection issue without changing the selected access method.",
      errors: unavailableChecks.length ? {
        storeConnection: shop.available ? undefined : shop.error,
        paymentSetup: paymentSetup.available ? undefined : paymentSetup.error,
        paymentHistory: paymentSignals.available ? undefined : paymentSignals.error,
        deliveryConfiguration: delivery.available ? undefined : delivery.error,
      } : undefined,
    }, null, 2));
    if (unavailableChecks.length) process.exitCode = 1;
    return;
  }
  if (command === "collect") {
    const [shop, paymentSetup, paymentSignals, delivery] = await Promise.all([
      readSafely(config, SHOP_QUERY, {}),
      readSafely(config, PAYMENT_SETUP_QUERY, {}),
      readSafely(config, PAYMENT_SIGNALS_QUERY, { first: 100 }),
      readSafely(config, DELIVERY_QUERY, {}),
    ]);
    const output = {
      generatedAt: new Date().toISOString(),
      accessMethod: config.accessMethod,
      connection: { available: shop.available, error: shop.available ? undefined : shop.error },
      paymentSetup: paymentSetup.available
        ? { available: true, state: paymentSetup.data.shopifyPaymentsAccount?.activated ? "setup_complete" : "not_available_or_not_complete" }
        : { available: false, state: "unknown", error: paymentSetup.error },
      paymentSignals: paymentSignals.available
        ? { available: true, ...summarizeTransactions(paymentSignals.data), note: "Aggregate order-transaction sample only; it does not attribute checkout abandonment to one provider." }
        : { available: false, error: paymentSignals.error },
      deliveryConfiguration: delivery.available
        ? { available: true, ...summarizeDelivery(delivery.data), note: "Configuration evidence only; verify the selected destinations in the live checkout." }
        : { available: false, error: delivery.error },
      limitations: [
        "No customer, order-line, payment credential, payout, or store identity is included.",
        "A completed payment was not tested.",
        "Storefront checkout results depend on the tested item and destination.",
      ],
    };
    const out = args.out || "checkout-admin.json";
    await writeFile(out, JSON.stringify(output, null, 2), "utf8");
    console.log(JSON.stringify({ ok: true, output: path.resolve(out), redacted: true }, null, 2));
    return;
  }
  usage();
  process.exitCode = 1;
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: safeError(error) }, null, 2));
    process.exitCode = 1;
  });
}

export {
  DEFAULT_API_VERSION,
  PAYMENT_SCOPE_ALTERNATIVES,
  REQUIRED_SCOPES,
  REQUIRED_STANDARD_SCOPES,
  assertScopes,
  envTemplate,
  normalizeDomain,
  parseEnv,
  safeError,
  summarizeTransactions,
};
