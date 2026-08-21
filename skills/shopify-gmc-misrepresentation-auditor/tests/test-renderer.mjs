import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const skillRoot = fileURLToPath(new URL("..", import.meta.url));
const audit = path.join(skillRoot, "scripts", "gmc-product-audit.mjs");
const fixture = path.join(skillRoot, "tests", "fixtures", "renderer-zh.json");

test("Chinese GMC renderer labels raw English evidence", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "shopify-gmc-renderer-"));
  try {
    const output = path.join(temp, "report.html");
    await execFileAsync(process.execPath, [audit, "--fixture", fixture, "--out", output, "--lang", "zh-CN"]);
    const html = await readFile(output, "utf8");
    assert.match(html, /GMC 失实陈述风险审计/);
    assert.match(html, /Raw evidence（原始证据）:/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /rawText":"Contact us <script>alert\(1\)<\/script>/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
