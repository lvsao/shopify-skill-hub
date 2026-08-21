import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ShopifyGraphqlError, runShopifyCli } from "./graphql.mjs";

function approvedScopes(value) {
  const scopes = [...new Set(String(value || "").split(",").map((scope) => scope.trim()).filter(Boolean))];
  if (!scopes.length || scopes.some((scope) => !/^[a-z][a-z_]*$/.test(scope))) {
    throw new ShopifyGraphqlError("SCOPES_INVALID", "Use a comma-separated list of Shopify scope names.");
  }
  return scopes.sort();
}

async function privateAppPath(value) {
  const appPath = path.resolve(String(value || ""));
  if (!appPath || !appPath.split(path.sep).includes(".skill-hub")) {
    throw new ShopifyGraphqlError("PRIVATE_APP_PATH_REQUIRED", "Use an existing merchant-owned app directory under a private .skill-hub folder.");
  }
  if (!await access(appPath).then(() => true).catch(() => false)) {
    throw new ShopifyGraphqlError("PRIVATE_APP_PATH_MISSING", "The approved private app directory does not exist.");
  }
  return appPath;
}

async function scopeConfigPath(appPath) {
  const names = await readdir(appPath);
  const candidates = names.filter((name) => /^shopify\.app(?:\.[a-z0-9_-]+)?\.toml$/i.test(name));
  if (candidates.length !== 1) {
    throw new ShopifyGraphqlError("APP_SCOPE_CONFIG_MISSING", "Expected exactly one existing shopify.app.toml configuration in the approved private app directory.");
  }
  return path.join(appPath, candidates[0]);
}

export function mergeTomlScopes(source, requestedScopes) {
  const boundary = source.search(/^\s*\[/m);
  const head = boundary < 0 ? source : source.slice(0, boundary);
  const match = head.match(/^(\s*scopes\s*=\s*")([^"]*)("[^\n]*)$/m);
  if (!match) throw new ShopifyGraphqlError("APP_SCOPE_CONFIG_MISSING", "The linked app configuration must have a top-level quoted scopes value before it can be upgraded.");
  const currentScopes = [...new Set(match[2].split(",").map((scope) => scope.trim()).filter(Boolean))].sort();
  const mergedScopes = [...new Set([...currentScopes, ...requestedScopes])].sort();
  return {
    currentScopes,
    mergedScopes,
    content: source.replace(match[0], `${match[1]}${mergedScopes.join(",")}${match[3]}`),
  };
}

export async function previewPermissionUpdate(config, { scopes, reason, appPath }) {
  if (config.accessMethod !== "dev_dashboard_client_credentials") {
    throw new ShopifyGraphqlError("PERMISSION_UPGRADE_REQUIRES_DEV_DASHBOARD", "Use Shopify CLI OAuth to re-authorize browser scopes, or select Dev Dashboard client credentials for an approved app release.");
  }
  const requestedScopes = approvedScopes(scopes);
  const merchantReason = String(reason || "").trim();
  if (!merchantReason) throw new ShopifyGraphqlError("SCOPE_REASON_REQUIRED", "Explain the merchant-facing reason for the proposed scope update.");
  const privatePath = await privateAppPath(appPath);
  const file = await scopeConfigPath(privatePath);
  const merged = mergeTomlScopes(await readFile(file, "utf8"), requestedScopes);
  return {
    requestedScopes,
    currentScopes: merged.currentScopes,
    proposedScopes: merged.mergedScopes,
    reason: merchantReason,
    status: "PREVIEW_ONLY",
    nextStep: "Review the exact merged scope list, obtain separate scope and release approvals, then run permission-upgrade with both approval flags.",
  };
}

export async function releasePermissionUpdate(config, { scopes, reason, appPath, scopesApproved, releaseApproved }) {
  if (config.accessMethod !== "dev_dashboard_client_credentials") {
    throw new ShopifyGraphqlError("PERMISSION_UPGRADE_REQUIRES_DEV_DASHBOARD", "Use Shopify CLI OAuth to re-authorize browser scopes, or select Dev Dashboard client credentials for an approved app release.");
  }
  if (scopesApproved !== true) throw new ShopifyGraphqlError("SCOPE_APPROVAL_REQUIRED", "Obtain approval for the exact missing scopes before releasing an app version.");
  if (releaseApproved !== true) throw new ShopifyGraphqlError("RELEASE_APPROVAL_REQUIRED", "Obtain separate approval before publishing the app version.");
  const token = String(config.SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN || "").trim();
  if (!token) throw new ShopifyGraphqlError("AUTOMATION_TOKEN_REQUIRED", "Configure the private Automation Token before an unattended approved release.");
  const requestedScopes = approvedScopes(scopes);
  const merchantReason = String(reason || "").trim();
  if (!merchantReason) throw new ShopifyGraphqlError("SCOPE_REASON_REQUIRED", "Explain the merchant-facing reason for the approved scope update.");
  const privatePath = await privateAppPath(appPath);
  let scopeFile;
  let originalScopes;

  try {
    await runShopifyCli(config, ["app", "config", "link", "--path", privatePath, "--client-id", config.SKILL_HUB_SHOPIFY_CLIENT_ID]);
    scopeFile = await scopeConfigPath(privatePath);
    originalScopes = await readFile(scopeFile, "utf8");
    const merged = mergeTomlScopes(originalScopes, requestedScopes);
    if (merged.content !== originalScopes) await writeFile(scopeFile, merged.content, "utf8");
    await runShopifyCli(config, ["app", "config", "validate", "--path", privatePath, "--json"]);
    await runShopifyCli(config, ["app", "deploy", "--path", privatePath, "--allow-updates"], {
      env: { ...process.env, SHOPIFY_APP_AUTOMATION_TOKEN: token },
    });
  } catch (error) {
    if (scopeFile && originalScopes !== undefined) await writeFile(scopeFile, originalScopes, "utf8").catch(() => {});
    if (error instanceof ShopifyGraphqlError) throw error;
    const detail = String(error?.stderr || error?.stdout || error?.message || error);
    throw new ShopifyGraphqlError("PERMISSION_RELEASE_FAILED", detail);
  }
  return {
    requestedScopes,
    reason: merchantReason,
    status: "PENDING_MERCHANT_APPROVAL",
    nextStep: "Open the installed app in Shopify admin, approve the pending permission update, then run connection-check. Do not deploy again while it is pending.",
  };
}
