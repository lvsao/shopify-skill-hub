import assert from "node:assert/strict";
import test from "node:test";
import { candidatesCsv, htmlLooksSoft404, isRobotsPathAllowed, parseCsv, parseRobots, renderReport, validateFixRows } from "../scripts/shopify-broken-link-doctor.mjs";
import { validatePublicUrl } from "../scripts/lib/public-fetch.mjs";

test("robots.txt blocks the doctor when the matching rule disallows root", () => {
  assert.deepEqual(parseRobots("User-agent: *\nDisallow: /\n"), { allowed: false, matchedRule: "/" });
  assert.equal(parseRobots("User-agent: *\nDisallow: /private\n").allowed, true);
  assert.deepEqual(isRobotsPathAllowed("User-agent: *\nDisallow: /private\n", "/private/item"), { allowed: false, matchedRule: "/private" });
});

test("public URL validation rejects loopback, private and credential-bearing destinations", () => {
  assert.throws(() => validatePublicUrl("http://127.0.0.1/"), /Private, local/);
  assert.throws(() => validatePublicUrl("http://user:pass@example.com/"), /Credential-bearing/);
  assert.equal(validatePublicUrl("https://example.com/store").hostname, "example.com");
});

test("report escapes untrusted store evidence and selects Chinese visible copy", () => {
  const html = renderReport({ lang: "zh-CN", host: "example.com</title><script>alert(1)</script>", signals: ['Shopify.shop evidence: </span><img src=x onerror=alert(1)>'], checks: [{ path: "/products/<img src=x>", status: 404, finalStatus: 404, finalUrl: "/products/<img src=x>", classification: "public_404_candidate", confidence: "high" }], robots: { allowed: true }, sitemap: { detail: "available" }, limit: 10 });
  assert.match(html, /Shopify 失效链接医生/);
  assert.match(html, /Content-Security-Policy/);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!html.includes("<img src=x onerror=alert(1)>"));
  assert.ok(!html.includes("<script>alert(1)</script>"));
});

test("soft-404 detection ignores CDN hashes and requires meaningful page text", () => {
  assert.equal(htmlLooksSoft404('<script src="https://cdn.example/a%2F4046ff21b9239.js"></script><main>Welcome</main>'), false);
  assert.equal(htmlLooksSoft404("<title>404 - Page Not Found</title>"), true);
  assert.equal(htmlLooksSoft404("<main><h1>Page not found</h1></main>"), true);
});

test("public report cannot be marked connected by a caller", () => {
  const html = renderReport({ mode: "connected", host: "example.com", checks: [], robots: { allowed: true }, sitemap: { detail: "available" }, limit: 10 });
  assert.match(html, /Public crawl/);
  assert.doesNotMatch(html, /Connected: Admin redirects checked/);
});

test("candidate CSV never auto-proposes a blanket redirect and excludes the probe", () => {
  const rows = parseCsv(candidatesCsv([{ path: "/products/removed", status: 404, finalStatus: 404, classification: "public_404_candidate", confidence: "high" }, { path: "/products/doctor-probe", status: 404, finalStatus: 404, classification: "intent_404", confidence: "high" }]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].target, "");
  assert.equal(rows[0].action, "keep_404");
  assert.equal(rows[0].approved, "false");
});

test("write rows require a safe, distinct path and target", () => {
  assert.deepEqual(validateFixRows([{ path: "/products/old", target: "/collections/new", action: "create", approved: "true" }])[0], { path: "/products/old", target: "/collections/new", action: "create", approved: true });
  assert.throws(() => validateFixRows([{ path: "/products/old", target: "/products/old", action: "create", approved: "true" }]), /path and target must differ/);
  assert.throws(() => validateFixRows([{ path: "https://bad.example", target: "/collections/new", action: "create", approved: "true" }]), /INVALID_PATH/);
});
