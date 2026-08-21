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
const scanner = path.join(skillRoot, "scripts", "store-scanner.mjs");
const fixture = path.join(skillRoot, "tests", "fixtures", "renderer-app-candidate.json");

test("fixture renderer shows a real app candidate without network access", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "shopify-theme-renderer-"));
  try {
    const output = path.join(temp, "report.html");
    await execFileAsync(process.execPath, [scanner, "--fixture", fixture, "--output", output, "--lang", "zh-CN"]);
    const html = await readFile(output, "utf8");
    assert.match(html, /Judge\.me Product Reviews/);
    assert.match(html, /高置信度/);
    assert.match(html, /https:\/\/apps\.shopify\.com\/judgeme/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /widget\.js\?<script>alert\(1\)<\/script>/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
