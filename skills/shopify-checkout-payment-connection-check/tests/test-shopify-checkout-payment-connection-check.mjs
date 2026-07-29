import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  assertScopes,
  envTemplate,
  normalizeDomain,
  parseEnv,
  summarizeTransactions,
} from "../scripts/checkout-admin-read.mjs";

const execFileAsync = promisify(execFile);
const skillRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(skillRoot, "scripts", "checkout-admin-read.mjs");

test("normalizes supported Shopify store locators without accepting arbitrary hosts", () => {
  assert.equal(normalizeDomain("https://demo-shop.myshopify.com/admin"), "demo-shop.myshopify.com");
  assert.equal(normalizeDomain("https://admin.shopify.com/store/demo-shop/settings"), "demo-shop.myshopify.com");
  assert.throws(() => normalizeDomain("https://example.com"), /INVALID_STORE_DOMAIN/);
});

test("parses private config and requires the complete read-only scope set", () => {
  assert.deepEqual(parseEnv("# comment\nKEY='value'\nEMPTY=\n"), { KEY: "value", EMPTY: "" });
  assert.doesNotThrow(() => assertScopes({ scopes: ["read_orders", "read_shipping", "read_shopify_payments_accounts"] }));
  assert.doesNotThrow(() => assertScopes({ scopes: ["read_orders", "read_shipping", "read_shopify_payments"] }));
  assert.doesNotThrow(() => assertScopes({ scopes: ["write_orders", "write_shipping", "read_shopify_payments_accounts"] }));
  assert.throws(() => assertScopes({ scopes: ["read_orders", "read_shopify_payments"] }), /read_shipping/);
  assert.throws(() => assertScopes({ scopes: ["read_orders", "read_shipping"] }), /one of read_shopify_payments_accounts or read_shopify_payments/);
});

test("summarizes flat Admin API transactions and keeps legacy connection compatibility", () => {
  const flat = summarizeTransactions({
    orders: {
      nodes: [{
        transactions: [
          { status: "SUCCESS", gateway: "shopify_payments", errorCode: null },
          { status: "FAILURE", gateway: "paypal", errorCode: "DECLINED" },
        ],
      }],
    },
  });
  assert.equal(flat.sampledOrders, 1);
  assert.equal(flat.sampledTransactions, 2);
  assert.equal(flat.byGateway.paypal.failures, 1);
  assert.equal(flat.byGateway.paypal.errorCodes.DECLINED, 1);

  const legacy = summarizeTransactions({
    orders: { nodes: [{ transactions: { nodes: [{ status: "ERROR", gateway: "legacy" }] } }] },
  });
  assert.equal(legacy.sampledTransactions, 1);
  assert.equal(legacy.byGateway.legacy.errors, 1);
});

test("init-env is deterministic, private, and rejects an unsupported selector", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "checkout-skill-test-"));
  const config = path.join(temp, "skill-hub.env");
  try {
    const { stdout } = await execFileAsync(process.execPath, [script, "init-env", "--method", "shopify_cli_oauth", "--env", config], { windowsHide: true });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.equal(await readFile(config, "utf8"), envTemplate("shopify_cli_oauth"));

    await assert.rejects(
      execFileAsync(process.execPath, [script, "init-env", "--method", "unsupported", "--env", path.join(temp, "invalid.env")], { windowsHide: true }),
      (error) => /INVALID_ACCESS_METHOD/.test(String(error.stderr)),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
