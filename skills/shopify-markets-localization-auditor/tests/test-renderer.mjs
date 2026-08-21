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
const auditor = path.join(skillRoot, "scripts", "shopify-markets-localization-auditor.mjs");
const fixture = path.join(skillRoot, "tests", "fixtures", "renderer-zh.json");

test("Markets report fixture renders Chinese UI without network access", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "shopify-markets-renderer-"));
  try {
    const output = path.join(temp, "report.html");
    await execFileAsync(process.execPath, [auditor, "report", "--input", fixture, "--output", output, "--lang", "zh-CN"]);
    const html = await readFile(output, "utf8");
    assert.match(html, /国际化审计报告/);
    assert.match(html, /lang="zh-CN"/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /市场 <script>alert\(1\)<\/script>/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
