import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { assertPublicDestination, isBlockedAddress, validatePublicUrl } from "../scripts/lib/public-fetch.mjs";

const execFileAsync = promisify(execFile);
const skillRoot = fileURLToPath(new URL("..", import.meta.url));
const adminScript = path.join(skillRoot, "scripts", "shopify-blog-seo-admin.mjs");

test("public URL validation rejects unsafe destinations", () => {
  assert.equal(validatePublicUrl("https://example.com/article").protocol, "https:");
  assert.throws(() => validatePublicUrl("file:///etc/passwd"), /Only HTTP and HTTPS/);
  assert.throws(() => validatePublicUrl("https://user:pass@example.com/article"), /Credential-bearing/);
  assert.throws(() => validatePublicUrl("http://127.0.0.1:8080/"), /private|local|invalid/i);
  assert.throws(() => validatePublicUrl("http://[::1]/"), /private|local|invalid/i);
  assert.equal(isBlockedAddress("169.254.169.254"), true);
  assert.equal(isBlockedAddress("8.8.8.8"), false);
});

test("DNS resolution cannot redirect a public hostname into a private range", async () => {
  await assert.rejects(
    assertPublicDestination("https://example.test/article", {
      lookup: async () => [{ address: "10.0.0.7", family: 4 }],
    }),
    /private|local|invalid/i,
  );

  const result = await assertPublicDestination("https://example.test/article", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  assert.equal(result.hostname, "example.test");
});

test("standalone report sets CSP and strips executable article markup", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "shopify-blog-seo-test-"));
  try {
    const input = path.join(temp, "plan.json");
    const output = path.join(temp, "report.html");
    await writeFile(input, JSON.stringify({
      article: {
        title: "Security fixture",
        body: '<h2 id="intro">Intro</h2><p>Safe content</p><img src="https://cdn.example/image.jpg" onerror="alert(1)"><svg><script>alert(2)</script></svg>',
        summary: "A safe summary",
        storefrontUrl: "https://example.com/blogs/news/security-fixture",
        image: { url: "https://cdn.example/hero.jpg", altText: "Hero" },
      },
      candidate: { body: '<h2 id="intro">Intro</h2><p>Safe content</p><img src="https://cdn.example/image.jpg" onerror="alert(1)"><svg><script>alert(2)</script></svg>' },
      preview: { mode: "theme-like-fallback", accessState: "not-verified" },
    }), "utf8");

    await execFileAsync(process.execPath, [adminScript, "report", "--input", input, "--output", output], { windowsHide: true });
    const report = await readFile(output, "utf8");

    assert.match(report, /Content-Security-Policy/);
    assert.match(report, /default-src 'none'/);
    assert.match(report, /object-src 'none'/);
    assert.match(report, /<h2 id="intro">Intro<\/h2>/);
    assert.doesNotMatch(report, /onerror\s*=|<script\b|<svg\b|alert\(/i);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
