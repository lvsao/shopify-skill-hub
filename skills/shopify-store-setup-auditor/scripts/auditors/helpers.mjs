import { completed, finding, unavailable } from "../core/results.mjs";
import { safeShopifyRead } from "../core/graphql.mjs";

export async function adminAudit(module, config, query, variables, inspect) {
  if (!config) return unavailable(module, "CONNECTION_NOT_CONFIGURED", "No authorized Shopify Admin connection was supplied.");
  const read = await safeShopifyRead(config, query, variables);
  if (!read.available) return unavailable(module, read.code, read.error);
  try {
    return completed(module, inspect(read.data), { source: "admin_api", apiVersion: config.apiVersion });
  } catch (error) {
    return unavailable(module, "AUDITOR_PARSE_FAILED", String(error?.message || error));
  }
}

export function pass(module, id, title, evidence, weight = 1) {
  return finding({ module, id, severity: "pass", title, evidence, source: "admin_api", confidence: "high", weight });
}

export function warn(module, id, title, evidence, weight = 1, fix = null, manual = null) {
  return finding({ module, id, severity: "warning", title, evidence, source: "admin_api", confidence: "high", weight, fix, manual });
}

export function critical(module, id, title, evidence, weight = 1, fix = null, manual = null) {
  return finding({ module, id, severity: "critical", title, evidence, source: "admin_api", confidence: "high", weight, fix, manual });
}

export function textLength(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length;
}

export function containsPlaceholder(text) {
  return /\[(?:insert|your|company|brand|address|email)[^\]]*\]|lorem ipsum|example\.com|contact@example/i.test(String(text || ""));
}
