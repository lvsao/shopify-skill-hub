import { access, appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { API_VERSIONS } from "./constants.mjs";

const CONFIG_KEYS = [
  "SKILL_HUB_SHOPIFY_ACCESS_METHOD",
  "SKILL_HUB_SHOPIFY_STORE_DOMAIN",
  "SKILL_HUB_SHOPIFY_CLIENT_ID",
  "SKILL_HUB_SHOPIFY_CLIENT_SECRET",
  "SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN",
  "SKILL_HUB_SHOPIFY_CLI_JS",
  "SKILL_HUB_SHOPIFY_API_VERSION",
];

const ACCESS_METHODS = new Set(["shopify_cli_oauth", "dev_dashboard_client_credentials"]);

export function parseEnv(text) {
  const values = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

export function normalizeStoreInput(value) {
  const raw = String(value || "").trim();
  const adminMatch = raw.match(/admin\.shopify\.com\/store\/([^/?&#\s]+)/i);
  const host = (adminMatch ? `${adminMatch[1]}.myshopify.com` : raw)
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(host)) {
    throw new Error("INVALID_STORE_DOMAIN: provide the exact <shop>.myshopify.com domain or Shopify Admin store URL.");
  }
  return host;
}

function isPlaceholder(value) {
  return !value || /<|xxx|replace|example/i.test(String(value));
}

export async function initEnv(envPath, method) {
  if (!ACCESS_METHODS.has(method)) {
    throw new Error("INVALID_ACCESS_METHOD: use shopify_cli_oauth or dev_dashboard_client_credentials.");
  }
  const exists = await access(envPath).then(() => true).catch(() => false);
  if (exists) throw new Error("ENV_FILE_EXISTS: refuse to overwrite private configuration.");
  const body = method === "shopify_cli_oauth"
    ? "SKILL_HUB_SHOPIFY_ACCESS_METHOD=shopify_cli_oauth\nSKILL_HUB_SHOPIFY_STORE_DOMAIN=\n# Authenticate this store with Shopify CLI before connection-check.\n# Optional when Shopify CLI is not on PATH:\n# SKILL_HUB_SHOPIFY_CLI_JS=\n"
    : "SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_client_credentials\nSKILL_HUB_SHOPIFY_STORE_DOMAIN=\nSKILL_HUB_SHOPIFY_CLIENT_ID=\nSKILL_HUB_SHOPIFY_CLIENT_SECRET=\n# Optional: only for an already-approved Dev Dashboard permission release.\n# SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN=\n";
  await writeFile(envPath, body, { encoding: "utf8", mode: 0o600 });
  const ignorePath = path.join(path.dirname(path.resolve(envPath)), ".gitignore");
  const ignore = await readFile(ignorePath, "utf8").catch(() => "");
  if (!ignore.split(/\r?\n/).some((line) => line.trim() === "skill-hub.env")) {
    await appendFile(ignorePath, `${ignore && !ignore.endsWith("\n") ? "\n" : ""}skill-hub.env\n`, "utf8").catch(() => {});
  }
}

export async function loadConfig(envPath) {
  const fileValues = await readFile(envPath, "utf8").then(parseEnv).catch(() => ({}));
  const values = { ...fileValues };
  for (const key of CONFIG_KEYS) if (String(process.env[key] || "").trim()) values[key] = process.env[key].trim();
  const accessMethod = values.SKILL_HUB_SHOPIFY_ACCESS_METHOD || "shopify_cli_oauth";
  if (!ACCESS_METHODS.has(accessMethod)) {
    throw new Error("INVALID_ACCESS_METHOD: use shopify_cli_oauth or dev_dashboard_client_credentials.");
  }
  const storeInput = normalizeStoreInput(values.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const apiVersion = values.SKILL_HUB_SHOPIFY_API_VERSION || API_VERSIONS[0];
  return { ...values, accessMethod, storeInput, apiVersion, envPath };
}

export function connectionReadiness(config) {
  if (config.accessMethod === "dev_dashboard_client_credentials") {
    return !isPlaceholder(config.SKILL_HUB_SHOPIFY_CLIENT_ID) && !isPlaceholder(config.SKILL_HUB_SHOPIFY_CLIENT_SECRET)
      ? { ready: true }
      : { ready: false, reason: "DEV_DASHBOARD_CREDENTIALS_REQUIRED" };
  }
  return config.storeInput ? { ready: true } : { ready: false, reason: "STORE_DOMAIN_REQUIRED" };
}

export function safeError(error) {
  return String(error?.message || error || "Unknown error")
    .replace(/(access[_-]?token|authorization|client[_-]?secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .slice(0, 600);
}
