#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, normalizeLanguage, requiredArg, selectedModules } from "./core/args.mjs";
import { connectionReadiness, initEnv, loadConfig, safeError } from "./core/config.mjs";
import { safeShopifyRead } from "./core/graphql.mjs";
import { validatePublicUrl } from "./core/public-fetch.mjs";
import { scoreAudit, unavailable } from "./core/results.mjs";
import { renderReport, readEmbeddedManifest } from "./core/report.mjs";
import { assertReportManifest, changeManifest, digest, loadChangeSet } from "./core/changes.mjs";
import { previewPermissionUpdate, releasePermissionUpdate } from "./core/permissions.mjs";
import { requiredAccessScopes } from "./fixers/actions.mjs";
import { executeChanges, previewChanges, verifyChanges } from "./fixers/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const auditors = {
  foundation: () => import("./auditors/foundation.mjs"), domain: () => import("./auditors/domain.mjs"), policies: () => import("./auditors/policies.mjs"), checkout: () => import("./auditors/checkout.mjs"), markets_shipping: () => import("./auditors/markets-shipping.mjs"), catalog: () => import("./auditors/catalog.mjs"), navigation: () => import("./auditors/navigation.mjs"), seo_theme: () => import("./auditors/seo-theme.mjs"), marketing_discounts: () => import("./auditors/marketing-discounts.mjs"), content_trust: () => import("./auditors/content-trust.mjs"),
};

function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
const USAGE = `Usage:
  init-env --method <shopify_cli_oauth|dev_dashboard_client_credentials> [--env skill-hub.env]
  connection-check [--env skill-hub.env]
  audit --env <skill-hub.env> --url <store-url> --out <report.html> [--modules all] [--lang auto|en|zh-CN]
  fix-preview --env <skill-hub.env> --from-report <report.html> --target <module> --changes <candidate.json>
  fix --env <skill-hub.env> --from-report <report.html> --target <module> --changes <candidate.json> --execute
  verify --env <skill-hub.env> --from-report <report.html> --target <module> --changes <candidate.json>
  permission-preview --env <skill-hub.env> --scopes <scope,...> --reason <merchant-reason> --app-path <private-.skill-hub-app-dir>
  permission-upgrade --env <skill-hub.env> --scopes <scope,...> --reason <merchant-reason> --app-path <private-.skill-hub-app-dir> --approve-scopes --approve-release`;
function languageFromEnvironment() { return /^zh/i.test(process.env.LANG || "") ? "zh-CN" : "en"; }
async function runBounded(names, context, limit = 3) {
  const results = new Array(names.length); let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, names.length) }, async () => {
    while (cursor < names.length) {
      const index = cursor; cursor += 1; const module = names[index];
      try { const loaded = await auditors[module](); results[index] = await loaded.audit(context); }
      catch (error) { results[index] = unavailable(module, "AUDITOR_FAILED", safeError(error)); }
    }
  });
  await Promise.allSettled(workers);
  return results;
}
async function auditCommand(args) {
  const rawUrl = requiredArg(args, "url"); const out = path.resolve(requiredArg(args, "out")); const url = validatePublicUrl(rawUrl).href;
  const envPath = path.resolve(String(args.env || "skill-hub.env")); const config = await loadConfig(envPath); const readiness = connectionReadiness(config);
  if (!readiness.ready) throw new Error(`AUTHORIZED_CONNECTION_REQUIRED: ${readiness.reason}`);
  const connection = await safeShopifyRead(config, `query ConnectionCheck { shop { id name myshopifyDomain } }`);
  if (!connection.available) throw new Error(`AUTHORIZED_CONNECTION_REQUIRED: ${connection.code}`);
  const modules = selectedModules(args.modules); const lang = normalizeLanguage(args.lang, languageFromEnvironment());
  const results = await runBounded(modules, { config, storeUrl: url });
  const audit = { generatedAt: new Date().toISOString(), storeUrl: url, results, score: scoreAudit(results) };
  const manifest = { kind: "shopify-store-setup-audit", version: 1, generatedAt: audit.generatedAt, storeUrl: url, lang, auditDigest: digest({ storeUrl: audit.storeUrl, generatedAt: audit.generatedAt, results: audit.results }), candidates: audit.results.flatMap((result) => (result.findings || []).filter((item) => item.fix).map((item) => ({ module: item.module, findingId: item.id, action: item.fix.action || null, resourceId: item.fix.resourceId || null, requiresMerchantValues: Boolean(item.fix.merchantValuesRequired || item.fix.merchantContentRequired) }))), changeSets: [] };
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, await renderReport({ lang, audit, manifest }), "utf8");
  print({ ok: true, report: out, score: audit.score, modules: results.map((result) => ({ module: result.module, status: result.status })) });
}
async function connectionCommand(args) {
  const config = await loadConfig(path.resolve(String(args.env || "skill-hub.env"))); const readiness = connectionReadiness(config);
  if (!readiness.ready) { print({ ok: false, code: readiness.reason, method: config.accessMethod }); process.exitCode = 2; return; }
  const read = await safeShopifyRead(config, `query ConnectionCheck { shop { id name myshopifyDomain } }`);
  print(read.available ? { ok: true, method: config.accessMethod, shop: read.data.shop, apiVersion: config.apiVersion } : { ok: false, code: read.code, detail: read.error, method: config.accessMethod });
  if (!read.available) process.exitCode = 2;
}
async function changesFor(args, target) {
  const manifest = assertReportManifest(await readEmbeddedManifest(path.resolve(requiredArg(args, "from-report"))));
  const changePath = args.changes ? path.resolve(String(args.changes)) : null;
  if (!changePath) throw new Error("CANDIDATE_CHANGES_REQUIRED: create a temporary candidate JSON from the report’s fix hints and pass --changes.");
  return { manifest, changes: await loadChangeSet(changePath, target, manifest) };
}
async function previewCommand(args) {
  const target = requiredArg(args, "target"); const config = await loadConfig(path.resolve(String(args.env || "skill-hub.env"))); const { manifest, changes } = await changesFor(args, target);
  const preview = await previewChanges(config, changes); const requiredScopes = requiredAccessScopes(changes);
  print({ ok: preview.every((item) => item.ok), target, auditDigest: manifest.auditDigest, changeManifest: changeManifest(changes), requiredScopes, scopeNextStep: requiredScopes.length ? "Before fix --execute, re-authorize these exact scopes with Shopify CLI or preview and approve a Dev Dashboard scope release." : null, preview });
}
async function fixCommand(args) {
  if (args.execute !== true) throw new Error("EXECUTE_FLAG_REQUIRED: fixes require the explicit --execute flag after module approval.");
  const target = requiredArg(args, "target"); const config = await loadConfig(path.resolve(String(args.env || "skill-hub.env"))); const { manifest, changes } = await changesFor(args, target);
  const result = await executeChanges(config, changes); print({ ok: !result.blocked.length && result.executed.every((item) => item.ok), target, auditDigest: manifest.auditDigest, ...result });
  if (result.blocked.length || result.executed.some((item) => !item.ok)) process.exitCode = 2;
}
async function verifyCommand(args) {
  const target = requiredArg(args, "target"); const config = await loadConfig(path.resolve(String(args.env || "skill-hub.env"))); const { manifest, changes } = await changesFor(args, target);
  const verified = await verifyChanges(config, changes); print({ ok: verified.every((item) => item.verified), target, auditDigest: manifest.auditDigest, verified });
  if (!verified.every((item) => item.verified)) process.exitCode = 2;
}
async function permissionUpgradeCommand(args) {
  const config = await loadConfig(path.resolve(String(args.env || "skill-hub.env")));
  const result = await releasePermissionUpdate(config, {
    scopes: requiredArg(args, "scopes"),
    reason: requiredArg(args, "reason"),
    appPath: requiredArg(args, "app-path"),
    scopesApproved: args["approve-scopes"] === true,
    releaseApproved: args["approve-release"] === true,
  });
  print({ ok: true, ...result });
}
async function permissionPreviewCommand(args) {
  const config = await loadConfig(path.resolve(String(args.env || "skill-hub.env")));
  const result = await previewPermissionUpdate(config, {
    scopes: requiredArg(args, "scopes"),
    reason: requiredArg(args, "reason"),
    appPath: requiredArg(args, "app-path"),
  });
  print({ ok: true, ...result });
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv); const command = args._[0];
  try {
    if (args.help === true || command === "help") process.stdout.write(`${USAGE}\n`);
    else if (command === "init-env") { const env = path.resolve(String(args.env || "skill-hub.env")); await initEnv(env, requiredArg(args, "method")); print({ ok: true, env, message: "Private environment template created. Add it to .gitignore and complete it locally." }); }
    else if (command === "connection-check") await connectionCommand(args);
    else if (command === "audit") await auditCommand(args);
    else if (command === "fix-preview") await previewCommand(args);
    else if (command === "fix") await fixCommand(args);
    else if (command === "verify") await verifyCommand(args);
    else if (command === "permission-preview") await permissionPreviewCommand(args);
    else if (command === "permission-upgrade") await permissionUpgradeCommand(args);
    else throw new Error("USAGE: init-env | connection-check | audit | fix-preview | fix | verify | permission-preview | permission-upgrade");
  } catch (error) { print({ ok: false, code: String(error?.message || error).split(":")[0], detail: safeError(error) }); process.exitCode = 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();

export { runBounded };
