#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPublicDestination, fetchPublic, validatePublicUrl } from "./lib/public-fetch.mjs";
import { connectionStatus, loadShopifyConfig, shopifyGraphql } from "./lib/shopify-auth.mjs";

const VERSION = "1.1.0";
const USER_AGENT = "Selofy-BrokenLinkDoctor/1.1";
const READ_SCOPES = ["read_online_store_navigation"];
const WRITE_SCOPES = ["read_online_store_navigation", "write_online_store_navigation"];
const CONNECTION_QUERY = "query ConnectionCheck { shop { name myshopifyDomain } urlRedirects(first: 1) { nodes { id path target } } }";
const REDIRECT_BY_PATH_QUERY = "query RedirectsByPath($query: String!) { urlRedirects(first: 50, query: $query) { nodes { id path target } } }";
const REDIRECT_CREATE = "mutation RedirectCreate($urlRedirect: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $urlRedirect) { urlRedirect { id path target } userErrors { field message } } }";
const REDIRECT_UPDATE = "mutation RedirectUpdate($id: ID!, $urlRedirect: UrlRedirectInput!) { urlRedirectUpdate(id: $id, urlRedirect: $urlRedirect) { urlRedirect { id path target } userErrors { field message } } }";
const REDIRECT_DELETE = "mutation RedirectDelete($id: ID!) { urlRedirectDelete(id: $id) { deletedUrlRedirectId userErrors { field message } } }";
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function usage() {
  console.log(`Shopify Broken Link Doctor ${VERSION}\n\nUsage:\n  node shopify-broken-link-doctor.mjs check-shopify --url <store-url>\n  node shopify-broken-link-doctor.mjs audit --url <store-url> --out <report.html> [--csv <candidates.csv>] [--limit 200] [--lang en|zh-CN]\n  node shopify-broken-link-doctor.mjs init-env --method shopify_cli_oauth|dev_dashboard_client_credentials --env skill-hub.env\n  node shopify-broken-link-doctor.mjs connection-check --env skill-hub.env\n  node shopify-broken-link-doctor.mjs fix-preview --env skill-hub.env --input <candidates.csv>\n  node shopify-broken-link-doctor.mjs fix --env skill-hub.env --input <approved.csv> --execute\n  node shopify-broken-link-doctor.mjs verify --env skill-hub.env --path </old-path>`);
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) { args._.push(value); continue; }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function decodeXml(value) { return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); }
function normalizeLang(value) { return value === "zh-CN" ? "zh-CN" : "en"; }

function reportCopy(lang) {
  return lang === "zh-CN" ? {
    title: "Shopify 失效链接医生", context: "审计上下文", summary: "执行摘要", tested: "已测试 URL", candidates: "公开 404 候选", chains: "跳转链 / 循环", admin: "需要 Admin 数据", findings: "已分组的发现", next: "下一步", evidence: "证据、限制与审批边界", healthy: "正常 URL 样本", blocked: "爬取已阻止", noData: "没有发现", manual: "需要人工审核", public: "公开爬取", connected: "已连接：Admin 跳转已核对", path: "路径", status: "状态", evidenceLabel: "证据", severity: "优先级", action: "建议", confidence: "置信度", limitation: "公开模式无法读取 Admin URL Redirects；不会创建、修改或删除 Shopify 数据。", approval: "此报告仅提供候选项。任何写入都需要先生成预览 CSV、获得明确批准，再使用 --execute。", probe: "404 探针", notTested: "未测试", report: "失效链接审计报告", mode: "模式", generated: "生成时间",
  } : {
    title: "Shopify Broken Link Doctor", context: "Audit context", summary: "Executive summary", tested: "URLs tested", candidates: "Public 404 candidates", chains: "Redirect chains / loops", admin: "Needs Admin data", findings: "Grouped findings", next: "Next actions", evidence: "Evidence, limits & approval", healthy: "Healthy URL sample", blocked: "Crawl blocked", noData: "No findings", manual: "Manual review required", public: "Public crawl", connected: "Connected: Admin redirects checked", path: "Path", status: "Status", evidenceLabel: "Evidence", severity: "Priority", action: "Recommendation", confidence: "Confidence", limitation: "Public mode cannot inspect Admin URL Redirects and never creates, updates, or deletes Shopify data.", approval: "This report is candidates only. Any write requires a preview CSV, explicit approval, and then --execute.", probe: "404 probe", notTested: "Not tested", report: "Broken link audit report", mode: "Mode", generated: "Generated",
  };
}

function matchingRobotsRules(robotsText, userAgent = USER_AGENT) {
  const groups = []; let agents = []; let rules = [];
  const close = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; };
  for (const rawLine of String(robotsText || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase(); const value = match[2].trim();
    if (key === "user-agent") { if (rules.length) close(); agents.push(value.toLowerCase()); }
    else if ((key === "allow" || key === "disallow") && agents.length) rules.push({ key, value });
  }
  close();
  const lowerAgent = userAgent.toLowerCase();
  const selected = groups.find((group) => group.agents.some((agent) => agent !== "*" && lowerAgent.includes(agent))) || groups.find((group) => group.agents.includes("*"));
  return selected?.rules || [];
}

export function isRobotsPathAllowed(robotsText, pathname, userAgent = USER_AGENT) {
  const pathValue = String(pathname || "/");
  const rules = matchingRobotsRules(robotsText, userAgent).filter((rule) => rule.value && pathValue.startsWith(rule.value));
  const longest = rules.sort((a, b) => b.value.length - a.value.length)[0];
  return longest?.key === "disallow" ? { allowed: false, matchedRule: longest.value } : { allowed: true, matchedRule: longest?.value || null };
}

export function parseRobots(robotsText, userAgent = USER_AGENT) {
  return isRobotsPathAllowed(robotsText, "/", userAgent);
}

export function htmlLooksSoft404(body) {
  const source = String(body || "");
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const visibleText = source
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ");
  const titleLooksMissing = /(?:\b(?:404|error\s*404)\b\s*[-:–—]?\s*(?:page\s+)?not\s+found\b|\bpage\s+not\s+found\b|\bsorry,?\s+this\s+page\b)/i.test(title);
  const bodyLooksMissing = /(?:\bpage\s+not\s+found\b|\bsorry,?\s+this\s+page\b)/i.test(visibleText);
  return titleLooksMissing || bodyLooksMissing;
}
function makeSameHostUrl(origin, pathValue) { const url = new URL(pathValue, origin); if (url.origin !== origin) throw new Error("URL is outside the canonical storefront host."); return url; }

async function sameHostRequest(url, { method = "GET", host }) {
  const checked = await assertPublicDestination(url, { allowedHosts: [host] });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000);
  try { return await fetch(checked, { method, redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml;q=0.9,*/*;q=0.8" }, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

export async function checkShopify(rawUrl) {
  const requested = validatePublicUrl(rawUrl);
  const home = await fetchPublic(requested.href, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.8" } });
  const canonical = new URL(home.url); const origin = canonical.origin; const host = canonical.hostname;
  const html = await home.text(); const headers = Object.fromEntries(home.headers.entries()); const signals = [];
  if ((headers["powered-by"] || "").toLowerCase().includes("shopify")) signals.push("powered-by: Shopify");
  if (headers["shopify-complexity-score"] || headers["x-shopify-request-id"]) signals.push("Shopify response header");
  const cdnCount = (html.match(/cdn\.shopify(?:cdn)?\.com/g) || []).length;
  if (cdnCount) signals.push(`Shopify CDN reference (${cdnCount})`);
  const shopMatch = html.match(/Shopify\.shop\s*=\s*"([^"\r\n]{1,255})"/);
  if (shopMatch) signals.push(`Shopify.shop evidence: ${shopMatch[1]}`); else if (/__shopify|Shopify\.theme/.test(html)) signals.push("Shopify theme evidence");
  let robotsText = "";
  try { const robots = await fetchPublic(new URL("/robots.txt", origin), { headers: { "User-Agent": USER_AGENT } }, { allowedHosts: [host] }); robotsText = await robots.text(); if (/shopify|cdn\.shopify/i.test(robotsText)) signals.push("robots.txt Shopify evidence"); } catch { /* optional */ }
  try { const products = await fetchPublic(new URL("/products.json?limit=1", origin), { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }, { allowedHosts: [host] }); if (products.status === 200 && /"products"\s*:/.test(await products.text())) signals.push("products.json response"); } catch { /* optional */ }
  return { isShopify: signals.length >= 2, origin, host, status: home.status, signals, robotsText };
}

export function extractInternalPaths(html, origin) {
  const paths = new Set(); const matcher = /href\s*=\s*(["'])(.*?)\1/gi; let match;
  while ((match = matcher.exec(String(html || "")))) {
    try { const url = new URL(match[2], origin); if (url.origin !== origin) continue; const pathname = url.pathname.replace(/\/+$/, "") || "/"; if (/^(?:\/products\/|\/collections\/|\/pages\/|\/blogs\/|\/$)/.test(pathname)) paths.add(pathname); } catch { /* malformed link */ }
  }
  return [...paths];
}

function locs(xml) { return [...String(xml || "").matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1])); }

export async function discoverPaths(origin, host, limit) {
  const result = { paths: [], sitemapStatus: "not_available", detail: "Sitemap not tested" }; let sitemap;
  try { sitemap = await fetchPublic(new URL("/sitemap.xml", origin), { headers: { "User-Agent": USER_AGENT } }, { allowedHosts: [host] }); } catch (error) { result.detail = `Sitemap unavailable: ${error.message}`; return result; }
  const index = await sitemap.text();
  if (sitemap.status !== 200 || !/<(?:sitemapindex|urlset)\b/i.test(index)) { result.sitemapStatus = "blocked"; result.detail = `Sitemap returned HTTP ${sitemap.status} or an unsupported document.`; return result; }
  result.sitemapStatus = "available"; const sourceLocs = locs(index); const isIndex = /<sitemapindex\b/i.test(index); const pageUrls = isIndex ? [] : [...sourceLocs];
  for (const sitemapUrl of (isIndex ? sourceLocs.filter((value) => /sitemap_(?:products|collections|pages|blogs)/i.test(value)).slice(0, 8) : [])) {
    try { const url = new URL(sitemapUrl, origin); if (url.hostname !== host) continue; const response = await fetchPublic(url, { headers: { "User-Agent": USER_AGENT } }, { allowedHosts: [host] }); if (response.status === 200) pageUrls.push(...locs(await response.text())); } catch { /* safe partial discovery */ }
  }
  const paths = new Set();
  for (const value of pageUrls) { try { const url = new URL(value, origin); if (url.hostname !== host) continue; const pathname = url.pathname.replace(/\/+$/, "") || "/"; if (/^(?:\/products\/|\/collections\/|\/pages\/|\/blogs\/)/.test(pathname)) paths.add(pathname); if (paths.size >= limit) break; } catch { /* malformed item */ } }
  result.paths = [...paths]; return result;
}

export async function inspectPath(origin, host, pathValue, { robotsText = "", respectRobots = true } = {}) {
  const robots = respectRobots ? isRobotsPathAllowed(robotsText, pathValue) : { allowed: true, matchedRule: null };
  if (!robots.allowed) return { path: pathValue, status: "not tested", finalStatus: "not tested", finalUrl: "—", confidence: "high", classification: "not_tested", robotsRule: robots.matchedRule };
  let current = makeSameHostUrl(origin, pathValue); const visited = new Set(); let redirects = 0; let initialStatus = null; let first = true;
  for (;;) {
    const response = await sameHostRequest(current, { method: first ? "HEAD" : "GET", host }); let active = response;
    if (first && [405, 501].includes(response.status)) active = await sameHostRequest(current, { method: "GET", host });
    first = false; if (initialStatus === null) initialStatus = active.status;
    if (active.status >= 300 && active.status < 400) {
      const location = active.headers.get("location");
      if (!location) return { path: pathValue, status: initialStatus, finalStatus: active.status, finalUrl: current.pathname, chainLength: redirects, confidence: "medium", classification: "redirect_without_location" };
      const next = new URL(location, current);
      if (next.hostname !== host) return { path: pathValue, status: initialStatus, finalStatus: active.status, finalUrl: next.href, chainLength: redirects + 1, confidence: "medium", classification: "external_redirect" };
      if (visited.has(next.pathname) || redirects >= 5) return { path: pathValue, status: initialStatus, finalStatus: 508, finalUrl: next.pathname, chainLength: redirects + 1, loop: true, confidence: "high", classification: "loop" };
      visited.add(current.pathname); current = next; redirects += 1; continue;
    }
    let body = "";
    if (active.status >= 200 && active.status < 300) { active = await sameHostRequest(current, { method: "GET", host }); body = await active.text(); }
    const soft404 = active.status === 200 && htmlLooksSoft404(body);
    const classification = soft404 || active.status === 404 || active.status === 410 ? "public_404_candidate" : redirects >= 2 ? "chain" : "healthy";
    return { path: pathValue, status: initialStatus, finalStatus: active.status, finalUrl: current.pathname, chainLength: redirects, soft404, confidence: soft404 ? "low" : "high", classification };
  }
}

export function classifyChecks(checks) { return checks.map((check) => ({ ...check, severity: check.loop ? "Critical" : check.classification === "chain" ? "High" : check.classification === "public_404_candidate" ? "Medium" : "Low" })); }
function badgeClass(severity) { return severity === "Critical" ? "danger" : severity === "High" ? "warning" : severity === "Medium" ? "info" : "neutral"; }
function recommendedAction(item, lang) { if (item.loop) return lang === "zh-CN" ? "中断循环；用 Admin 数据核对最终 200 目标。" : "Break the loop; confirm the final 200 target with Admin data."; if (item.classification === "chain") return lang === "zh-CN" ? "扁平化到最终 200 URL；写入前核对 Admin Redirects。" : "Flatten to the final 200 URL after checking Admin Redirects."; if (item.classification === "public_404_candidate") return lang === "zh-CN" ? "先核对外链/索引与最近替代品；没有合适目标时保留 404。" : "Check backlinks/indexing and the closest replacement; keep the 404 when no relevant target exists."; return lang === "zh-CN" ? "无需操作。" : "No action needed."; }

export function renderReport({ lang = "en", host, state = "complete", signals = [], checks = [], probe, sitemap, robots, limit }) {
  const mode = "public";
  const locale = normalizeLang(lang); const t = reportCopy(locale); const items = classifyChecks(checks); const candidates = items.filter((item) => item.classification === "public_404_candidate"); const chains = items.filter((item) => item.classification === "chain" || item.loop); const healthy = items.filter((item) => item.classification === "healthy"); const blocked = state === "blocked";
  const row = (item) => `<tr><td><code>${escapeHtml(item.path)}</code></td><td>${escapeHtml(item.status)} → ${escapeHtml(item.finalStatus)}${item.soft404 ? " · soft 404" : ""}</td><td>${escapeHtml(item.finalUrl || "—")}</td><td><span class="badge ${badgeClass(item.severity)}">${escapeHtml(item.severity)}</span></td><td>${escapeHtml(item.confidence || "medium")}</td><td>${escapeHtml(recommendedAction(item, locale))}</td></tr>`;
  const table = (list, empty) => list.length ? list.map(row).join("") : `<tr><td colspan="6" class="muted">${escapeHtml(empty)}</td></tr>`;
  const summary = blocked ? (locale === "zh-CN" ? `爬取已停止：robots.txt 的 ${robots?.matchedRule || "规则"} 不允许此用户代理访问。` : `Crawl stopped: robots.txt rule ${robots?.matchedRule || ""} does not allow this user agent.`) : (locale === "zh-CN" ? `已测试 ${items.length} 个公开 URL。发现 ${candidates.length} 个需要人工确认的公开 404 候选、${chains.length} 个跳转链/循环。` : `Tested ${items.length} public URLs. Found ${candidates.length} public 404 candidates requiring review and ${chains.length} redirect chains/loops.`);
  const generated = new Date().toISOString();
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${escapeHtml(t.report)} · ${escapeHtml(host)}</title><style>:root{--report-bg:#fafafa;--report-surface:#fff;--report-surface-subtle:#f8fafc;--report-border:#e4e4e7;--report-border-subtle:#f4f4f5;--report-fg:#09090b;--report-muted:#71717a;--report-danger-fg:#b91c1c;--report-danger-bg:#fef2f2;--report-warning-fg:#b45309;--report-warning-bg:#fffbeb;--report-info-fg:#1d4ed8;--report-info-bg:#eff6ff;--report-font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif;--report-radius:10px}*{box-sizing:border-box}body{margin:0;background:var(--report-bg);color:var(--report-fg);font:14px/1.55 var(--report-font-sans)}main{max-width:1120px;margin:auto;padding:24px}.card{background:var(--report-surface);border:1px solid var(--report-border);border-radius:var(--report-radius);padding:18px;margin:14px 0;box-shadow:0 1px 3px rgba(0,0,0,.04)}h1,h2{line-height:1.25;margin:0 0 8px}h1{font-size:26px}h2{font-size:17px}.muted{color:var(--report-muted)}.summary{border-left:4px solid #09090b}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{font-size:24px;font-weight:700}.label{color:var(--report-muted);font-size:12px}.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:600}.danger{background:var(--report-danger-bg);color:var(--report-danger-fg)}.warning{background:var(--report-warning-bg);color:var(--report-warning-fg)}.info{background:var(--report-info-bg);color:var(--report-info-fg)}.neutral{background:var(--report-surface-subtle);color:var(--report-muted)}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:760px}th,td{padding:9px;text-align:left;vertical-align:top;border-bottom:1px solid var(--report-border-subtle)}th{font-size:12px;color:var(--report-muted)}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}@media(max-width:760px){main{padding:14px}.grid{grid-template-columns:repeat(2,1fr)}.card{padding:14px}}@media print{body{background:#fff}main{max-width:none;padding:0}.card{box-shadow:none;break-inside:avoid}table{font-size:11px}}</style></head><body><main><header class="card"><div class="label">${escapeHtml(t.context)}</div><h1>${escapeHtml(t.title)}</h1><div class="muted">${escapeHtml(host)} · ${escapeHtml(t.mode)}: ${escapeHtml(mode === "connected" ? t.connected : t.public)} · ${escapeHtml(t.generated)}: ${escapeHtml(generated)}</div></header><section class="card summary" aria-labelledby="summary"><h2 id="summary">${escapeHtml(blocked ? t.blocked : t.summary)}</h2><p>${escapeHtml(summary)}</p></section><section class="grid" aria-label="${escapeHtml(t.summary)}"><div class="card"><div class="label">${escapeHtml(t.tested)}</div><div class="metric">${items.length}</div></div><div class="card"><div class="label">${escapeHtml(t.candidates)}</div><div class="metric">${candidates.length}</div></div><div class="card"><div class="label">${escapeHtml(t.chains)}</div><div class="metric">${chains.length}</div></div><div class="card"><div class="label">${escapeHtml(t.admin)}</div><div class="metric">${mode === "connected" ? "0" : t.notTested}</div></div></section><section class="card"><h2>${escapeHtml(t.findings)}</h2><div class="table-wrap"><table><thead><tr><th>${escapeHtml(t.path)}</th><th>${escapeHtml(t.status)}</th><th>${escapeHtml(t.evidenceLabel)}</th><th>${escapeHtml(t.severity)}</th><th>${escapeHtml(t.confidence)}</th><th>${escapeHtml(t.action)}</th></tr></thead><tbody>${table([...candidates, ...chains], t.noData)}</tbody></table></div></section><section class="card"><h2>${escapeHtml(t.healthy)}</h2><div class="table-wrap"><table><thead><tr><th>${escapeHtml(t.path)}</th><th>${escapeHtml(t.status)}</th><th>${escapeHtml(t.evidenceLabel)}</th><th>${escapeHtml(t.severity)}</th><th>${escapeHtml(t.confidence)}</th><th>${escapeHtml(t.action)}</th></tr></thead><tbody>${table(healthy.slice(0, 12), t.noData)}</tbody></table></div></section><section class="card"><h2>${escapeHtml(t.evidence)}</h2><p>${escapeHtml(t.limitation)}</p><p>${escapeHtml(t.approval)}</p><ul><li>${escapeHtml(t.probe)}: ${escapeHtml(probe ? `${probe.finalStatus}${probe.soft404 ? " soft-404" : ""}` : t.notTested)}</li><li>robots.txt: ${escapeHtml(robots?.allowed ? "allowed" : robots?.matchedRule ? `blocked (${robots.matchedRule})` : t.notTested)}</li><li>${escapeHtml(sitemap?.detail || t.notTested)} · limit ${escapeHtml(limit)}</li><li>${escapeHtml(signals.join(" · ") || t.manual)}</li></ul></section></main></body></html>`;
}

function csvCell(value) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
export function candidatesCsv(checks) { const header = ["path", "target", "reason", "evidence", "severity", "action", "google_note", "ux_note", "approved"]; const rows = classifyChecks(checks).filter((item) => item.classification === "public_404_candidate").map((item) => [item.path, "", "public_404_candidate", `${item.status}->${item.finalStatus}${item.soft404 ? " soft-404" : ""}`, item.severity, "keep_404", "Confirm external evidence and a relevant target before redirecting.", "Keep an honest 404 if no relevant replacement exists.", "false"]); return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n"; }
export function parseCsv(text) { const rows = []; let row = []; let value = ""; let quoted = false; const input = String(text || "").replace(/^\uFEFF/, ""); for (let index = 0; index <= input.length; index += 1) { const char = input[index] || "\n"; if (quoted) { if (char === '"' && input[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') quoted = false; else value += char; continue; } if (char === '"') { quoted = true; continue; } if (char === ",") { row.push(value); value = ""; continue; } if (char === "\n" || char === "\r") { if (char === "\r" && input[index + 1] === "\n") index += 1; row.push(value); if (row.some((cell) => cell !== "")) rows.push(row); row = []; value = ""; continue; } value += char; } if (!rows.length) throw new Error("CSV is empty."); const [header, ...body] = rows; const keys = header.map((key) => key.trim()); for (const required of ["path", "target", "action", "approved"]) if (!keys.includes(required)) throw new Error(`CSV is missing required column: ${required}`); return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, String(cells[index] || "").trim()]))); }
function validateStorePath(value, label) { const text = String(value || "").trim(); if (!text.startsWith("/") || text.startsWith("//") || /[\r\n]/.test(text) || text.length > 1024) throw new Error(`INVALID_${label}: use a safe absolute storefront path.`); return text; }
export function validateFixRows(rows) { return rows.map((row, index) => { const action = String(row.action || "").toLowerCase(); if (!["create", "update", "delete", "keep_404"].includes(action)) throw new Error(`INVALID_ACTION on CSV row ${index + 2}.`); const pathValue = validateStorePath(row.path, "PATH"); const approved = /^(true|yes)$/i.test(row.approved); const target = action === "create" || action === "update" ? validateStorePath(row.target, "TARGET") : String(row.target || ""); if ((action === "create" || action === "update") && pathValue === target) throw new Error(`INVALID_TARGET on CSV row ${index + 2}: path and target must differ.`); return { ...row, path: pathValue, target, action, approved }; }); }
async function redirectByPath(env, pathValue) { const data = await shopifyGraphql(env, REDIRECT_BY_PATH_QUERY, { query: `path:${pathValue}` }, { requiredScopes: READ_SCOPES }); return (data.urlRedirects?.nodes || []).find((node) => node.path === pathValue) || null; }
function assertUserErrors(payload) { const errors = payload?.userErrors || []; if (errors.length) throw new Error(`SHOPIFY_USER_ERRORS: ${errors.map((error) => `${error.field?.join(".") || "input"}: ${error.message}`).join("; ")}`); }
async function createPreview(env, rows) { const preview = []; for (const row of rows) { const existing = await redirectByPath(env, row.path); const writable = row.action !== "keep_404" && row.approved && ((row.action === "create" && !existing) || ((row.action === "update" || row.action === "delete") && existing)); preview.push({ path: row.path, target: row.target || null, action: row.action, approved: row.approved, existingRedirect: existing ? { id: existing.id, path: existing.path, target: existing.target } : null, writable, reason: writable ? "Ready only after the current command is explicitly executed." : row.action === "keep_404" ? "No redirect proposed; merchant must choose a relevant target before changing action." : !row.approved ? "CSV row is not approved." : row.action === "create" ? "A redirect already exists for this path." : "No existing redirect matches this path." }); } return preview; }
async function applyRows(env, rows) { const written = []; for (const row of rows) { if (row.action === "keep_404") continue; if (!row.approved) throw new Error(`CSV row for ${row.path} is not approved.`); const existing = await redirectByPath(env, row.path); if (row.action === "create") { if (existing) throw new Error(`REDIRECT_ALREADY_EXISTS: ${row.path}`); const data = await shopifyGraphql(env, REDIRECT_CREATE, { urlRedirect: { path: row.path, target: row.target } }, { mutation: true, requiredScopes: WRITE_SCOPES }); assertUserErrors(data.urlRedirectCreate); written.push({ action: "create", redirect: data.urlRedirectCreate.urlRedirect }); } else if (row.action === "update") { if (!existing) throw new Error(`REDIRECT_NOT_FOUND: ${row.path}`); const data = await shopifyGraphql(env, REDIRECT_UPDATE, { id: existing.id, urlRedirect: { path: row.path, target: row.target } }, { mutation: true, requiredScopes: WRITE_SCOPES }); assertUserErrors(data.urlRedirectUpdate); written.push({ action: "update", redirect: data.urlRedirectUpdate.urlRedirect }); } else if (row.action === "delete") { if (!existing) throw new Error(`REDIRECT_NOT_FOUND: ${row.path}`); const data = await shopifyGraphql(env, REDIRECT_DELETE, { id: existing.id }, { mutation: true, requiredScopes: WRITE_SCOPES }); assertUserErrors(data.urlRedirectDelete); written.push({ action: "delete", deletedId: data.urlRedirectDelete.deletedUrlRedirectId }); } } return written; }
async function writeEnv(file, method) { if (!["shopify_cli_oauth", "dev_dashboard_client_credentials"].includes(method)) throw new Error("INVALID_ACCESS_METHOD: choose shopify_cli_oauth or dev_dashboard_client_credentials."); if (await fs.access(file).then(() => true).catch(() => false)) throw new Error("ENV_FILE_EXISTS: refuse to overwrite private configuration. Edit it manually or choose another path."); await fs.writeFile(file, `SKILL_HUB_SHOPIFY_ACCESS_METHOD=${method}\nSKILL_HUB_SHOPIFY_STORE_DOMAIN=\n# Dev Dashboard mode only; never commit these values.\n# SKILL_HUB_SHOPIFY_CLIENT_ID=\n# SKILL_HUB_SHOPIFY_CLIENT_SECRET=\n# Optional only for a separately approved scope-release workflow:\n# SKILL_HUB_SHOPIFY_APP_AUTOMATION_TOKEN=\n`, { mode: 0o600 }); }

async function runAudit(args) {
  const lang = normalizeLang(args.lang);
  const limit = Number.parseInt(args.limit || "200", 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("INVALID_LIMIT: choose an integer from 1 to 200.");
  if (!args.url) throw new Error("Missing --url.");
  const shop = await checkShopify(args.url);
  if (!shop.isShopify) {
    console.log(JSON.stringify({ ok: false, code: "NOT_SHOPIFY", signals: shop.signals, nextStep: "Provide a Shopify storefront URL or a known public product URL." }, null, 2));
    process.exitCode = 2;
    return;
  }
  const robots = parseRobots(shop.robotsText);
  let sitemap = { paths: [], sitemapStatus: "not_tested", detail: "Not tested because crawl is blocked." };
  const checks = [];
  let probe = null;
  let state = "complete";
  if (!robots.allowed) state = "blocked";
  else {
    sitemap = await discoverPaths(shop.origin, shop.host, limit);
    const home = await fetchPublic(shop.origin, { headers: { "User-Agent": USER_AGENT } }, { allowedHosts: [shop.host] });
    const discovered = [...new Set([...sitemap.paths, ...extractInternalPaths(await home.text(), shop.origin)])].slice(0, limit);
    for (const pathValue of discovered) {
      checks.push(await inspectPath(shop.origin, shop.host, pathValue, { robotsText: shop.robotsText }));
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
    probe = await inspectPath(shop.origin, shop.host, "/products/selofy-broken-link-doctor-probe-404", { robotsText: shop.robotsText });
  }
  const output = args.out || `shopify-broken-link-report-${shop.host.replace(/[^a-z0-9.-]/gi, "-")}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
  await fs.writeFile(output, renderReport({ lang, host: shop.host, signals: shop.signals, checks, probe, sitemap, robots, state, limit }), "utf8");
  if (args.csv) await fs.writeFile(args.csv, candidatesCsv(checks), "utf8");
  console.log(JSON.stringify({ ok: state === "complete", state, output: path.resolve(output), csv: args.csv ? path.resolve(args.csv) : null, tested: checks.length, candidateCount: classifyChecks(checks).filter((item) => item.classification === "public_404_candidate").length, probe: probe ? { finalStatus: probe.finalStatus, expected404: probe.finalStatus === 404 && !probe.soft404 } : null, nextStep: state === "blocked" ? "Respect robots.txt; do not retry unless the merchant changes access." : "Review the report. Auto-fix is available only after a merchant selects relevant targets, marks individual CSV rows approved, and explicitly asks to execute." }, null, 2));
}

async function main() { const args = parseArgs(process.argv.slice(2)); const command = args._[0]; if (!command || args.help || args.h) return usage(); try { if (command === "check-shopify") { if (!args.url) throw new Error("Missing --url."); const result = await checkShopify(args.url); console.log(JSON.stringify({ isShopify: result.isShopify, origin: result.origin, signals: result.signals }, null, 2)); process.exitCode = result.isShopify ? 0 : 2; return; } if (command === "audit") return runAudit(args); if (command === "init-env") { const file = args.env || "skill-hub.env"; await writeEnv(file, args.method || "shopify_cli_oauth"); console.log(JSON.stringify({ ok: true, env: path.resolve(file), nextStep: "Add only the non-secret store domain for quick connection, then run shopify store auth in the browser before connection-check." }, null, 2)); return; } if (!["connection-check", "fix-preview", "fix", "verify"].includes(command)) { usage(); process.exitCode = 2; return; } const env = await loadShopifyConfig(args.env || "skill-hub.env"); if (command === "connection-check") { const [connection, data] = await Promise.all([connectionStatus(env), shopifyGraphql(env, CONNECTION_QUERY, {}, { requiredScopes: READ_SCOPES })]); console.log(JSON.stringify({ ok: true, connection, shop: data.shop, redirectReadReady: true, nextStep: "Run fix-preview only after reviewing a public audit CSV and choosing relevant targets." }, null, 2)); return; } if (command === "verify") { if (!args.path) throw new Error("Missing --path."); const check = await inspectPath(`https://${env.SHOPIFY_STORE_DOMAIN}`, env.SHOPIFY_STORE_DOMAIN, validateStorePath(args.path, "PATH")); console.log(JSON.stringify({ ok: check.status >= 300 && check.status < 400 && check.finalStatus === 200, verification: check }, null, 2)); return; } if (!args.input) throw new Error("Missing --input."); const rows = validateFixRows(parseCsv(await fs.readFile(args.input, "utf8"))); if (command === "fix-preview") { const preview = await createPreview(env, rows); console.log(JSON.stringify({ ok: true, preview, approvalRequired: true, nextStep: "Correct any row, ensure each proposed write has approved=true, obtain explicit merchant approval, then run fix --execute." }, null, 2)); return; } if (!args.execute) throw new Error("EXECUTE_CONFIRMATION_REQUIRED: preview first, obtain explicit merchant approval, then rerun with --execute."); const written = await applyRows(env, rows); console.log(JSON.stringify({ ok: true, written, nextStep: "Run verify for every written source path and confirm each resolves through a 301 to a final 200." }, null, 2)); } catch (error) { console.error(JSON.stringify({ ok: false, error: error.message }, null, 2)); process.exitCode = 1; } }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
