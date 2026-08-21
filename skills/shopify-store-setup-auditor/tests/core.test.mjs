import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { connectionReadiness, initEnv, normalizeStoreInput, parseEnv, safeError } from "../scripts/core/config.mjs";
import { assertPublicDestination, isPrivateAddress, robotsAllowsRoot, validatePublicUrl } from "../scripts/core/public-fetch.mjs";
import { completed, finding, scoreAudit, unavailable } from "../scripts/core/results.mjs";
import { changeManifest, loadChangeSet, validateChange } from "../scripts/core/changes.mjs";
import { mergeTomlScopes, previewPermissionUpdate, releasePermissionUpdate } from "../scripts/core/permissions.mjs";
import { renderReport, readEmbeddedManifest } from "../scripts/core/report.mjs";

const productChange = {
  id: "catalog-product-title-1", module: "catalog", findingId: "product-title-1", type: "product_update",
  resource: { id: "gid://shopify/Product/1", kind: "Product" },
  before: { id: "gid://shopify/Product/1", updatedAt: "2026-01-01T00:00:00Z" },
  input: { product: { id: "gid://shopify/Product/1", title: "Approved" } }, expected: { title: "Approved" },
  merchantProvided: true, moduleApproval: true,
};

test("config accepts only a Shopify Admin URL or exact myshopify domain", () => {
  assert.equal(normalizeStoreInput("https://admin.shopify.com/store/my-demo"), "my-demo.myshopify.com");
  assert.equal(normalizeStoreInput("my-demo.myshopify.com"), "my-demo.myshopify.com");
  assert.throws(() => normalizeStoreInput("shop.example"), /INVALID_STORE_DOMAIN/);
  assert.equal(parseEnv("A='b'\n# ignored\n").A, "b");
  assert.match(safeError("Authorization: secret-value"), /\[redacted\]/);
});

test("init-env creates only supported private connection templates", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "store-setup-env-"));
  try {
    const cliEnv = path.join(directory, "skill-hub.env");
    await initEnv(cliEnv, "shopify_cli_oauth");
    assert.match(await readFile(cliEnv, "utf8"), /SKILL_HUB_SHOPIFY_ACCESS_METHOD=shopify_cli_oauth/);
    assert.match(await readFile(path.join(directory, ".gitignore"), "utf8"), /skill-hub\.env/);
    await assert.rejects(() => initEnv(path.join(directory, "other.env"), "settings_custom_app"), /INVALID_ACCESS_METHOD/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("connection readiness does not support static Admin tokens", () => {
  assert.equal(connectionReadiness({ accessMethod: "shopify_cli_oauth", storeInput: "demo.myshopify.com" }).ready, true);
  assert.equal(connectionReadiness({ accessMethod: "dev_dashboard_client_credentials", storeInput: "demo.myshopify.com", SKILL_HUB_SHOPIFY_CLIENT_ID: "id", SKILL_HUB_SHOPIFY_CLIENT_SECRET: "secret" }).ready, true);
  assert.equal(connectionReadiness({ accessMethod: "dev_dashboard_client_credentials", storeInput: "demo.myshopify.com" }).reason, "DEV_DASHBOARD_CREDENTIALS_REQUIRED");
});

test("public URL guards reject private destinations and keep DNS validation explicit", async () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("fc00::1"), true);
  assert.throws(() => validatePublicUrl("http://127.0.0.1"), /PRIVATE/);
  await assert.rejects(() => assertPublicDestination("https://shop.example", { lookup: async () => [{ address: "127.0.0.1", family: 4 }] }), /DNS_PRIVATE/);
  assert.equal(robotsAllowsRoot("User-agent: *\nDisallow: /\n"), false);
  assert.equal(robotsAllowsRoot("User-agent: *\nDisallow: /admin\n"), true);
});

test("score never reports Ready when a required module is unavailable", () => {
  const audit = scoreAudit([
    completed("foundation", [finding({ module: "foundation", id: "ok", severity: "pass", title: "OK", evidence: {}, source: "test" })]),
    unavailable("catalog", "SCOPE", "missing"),
  ]);
  assert.equal(audit.label, "Partial evidence");
  assert.equal(audit.requiredEvidenceMissing, true);
});

test("candidate changes are report-bound, expected-state-bound, and module-approved", async () => {
  assert.throws(() => validateChange({ ...productChange, moduleApproval: false }, "catalog"), /MODULE_APPROVAL_REQUIRED/);
  assert.throws(() => validateChange({ ...productChange, expected: {} }, "catalog"), /EXPECTED_STATE_REQUIRED/);
  assert.throws(() => validateChange({ ...productChange, expected: { id: "gid://shopify/Product/1" } }, "catalog"), /EXPECTED_EFFECT_REQUIRED/);
  const directory = await mkdtemp(path.join(os.tmpdir(), "store-setup-test-"));
  try {
    const file = path.join(directory, "changes.json");
    const manifest = { auditDigest: "abc", candidates: [{ module: "catalog", findingId: "product-title-1", action: "product_update", resourceId: "gid://shopify/Product/1" }] };
    await writeFile(file, JSON.stringify({ auditDigest: "abc", changes: [productChange] }));
    const values = await loadChangeSet(file, "catalog", manifest);
    assert.equal(values.length, 1);
    assert.equal(changeManifest(values).count, 1);
    await writeFile(file, JSON.stringify({ auditDigest: "wrong", changes: [productChange] }));
    await assert.rejects(() => loadChangeSet(file, "catalog", manifest), /CANDIDATE_AUDIT_MISMATCH/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("permission releases stop before any CLI call without the two approvals", async () => {
  const config = { accessMethod: "dev_dashboard_client_credentials", SKILL_HUB_SHOPIFY_CLIENT_ID: "id", SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN: "private" };
  await assert.rejects(() => releasePermissionUpdate(config, { scopes: "write_products", reason: "Approved catalog fix", appPath: "/tmp/.skill-hub/app", scopesApproved: false, releaseApproved: false }), /SCOPE_APPROVAL_REQUIRED/);
  await assert.rejects(() => releasePermissionUpdate({ accessMethod: "shopify_cli_oauth" }, { scopes: "write_products", reason: "Approved catalog fix", appPath: "/tmp/.skill-hub/app", scopesApproved: true, releaseApproved: true }), /PERMISSION_UPGRADE_REQUIRES_DEV_DASHBOARD/);
});

test("permission releases merge exact approved scopes into an existing top-level app config", () => {
  const merged = mergeTomlScopes('name = "Private app"\nscopes = "read_products"\n[web]\nembedded = true\n', ["write_products", "read_products"]);
  assert.deepEqual(merged.currentScopes, ["read_products"]);
  assert.deepEqual(merged.mergedScopes, ["read_products", "write_products"]);
  assert.match(merged.content, /scopes = "read_products,write_products"/);
  assert.throws(() => mergeTomlScopes("[web]\nembedded = true\n", ["write_products"]), /APP_SCOPE_CONFIG_MISSING/);
});

test("permission preview is read-only and shows the full merged scope list", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "store-setup-permissions-"));
  try {
    const appPath = path.join(directory, ".skill-hub", "app");
    await mkdir(appPath, { recursive: true });
    await writeFile(path.join(appPath, "shopify.app.toml"), 'name = "Private app"\nscopes = "read_products"\n');
    const preview = await previewPermissionUpdate({ accessMethod: "dev_dashboard_client_credentials" }, { scopes: "write_products", reason: "Approved catalog fix", appPath });
    assert.equal(preview.status, "PREVIEW_ONLY");
    assert.deepEqual(preview.proposedScopes, ["read_products", "write_products"]);
    assert.match(await readFile(path.join(appPath, "shopify.app.toml"), "utf8"), /scopes = "read_products"/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("HTML report escapes evidence, preserves the manifest, and localizes empty states", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "store-setup-report-"));
  try {
    const output = path.join(directory, "report.html");
    const result = completed("seo_theme", [finding({ module: "seo_theme", id: "xss", severity: "warning", title: "<img src=x>", evidence: { payload: "</script><img src=x>" }, source: "test" })]);
    const audit = { generatedAt: "2026-01-01T00:00:00.000Z", storeUrl: "https://shop.example", score: scoreAudit([result]), results: [result] };
    await writeFile(output, await renderReport({ lang: "zh-CN", audit, manifest: { kind: "shopify-store-setup-audit", auditDigest: "abc" } }));
    const text = await readFile(output, "utf8");
    assert.ok(text.includes("&lt;img src=x&gt;"));
    assert.ok(text.includes("本次没有可评估的发现") === false);
    assert.ok(text.includes("Content-Security-Policy"));
    assert.equal((await readEmbeddedManifest(output)).auditDigest, "abc");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
