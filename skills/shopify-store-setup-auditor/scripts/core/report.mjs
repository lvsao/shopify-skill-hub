import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { escapeHtml } from "./public-fetch.mjs";

const templatePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/report-template.html");

const words = {
  en: {
    title: "Shopify Store Setup Audit", generated: "Generated", score: "Readiness score", coverage: "Evidence coverage", critical: "Critical blockers", findings: "Findings", actions: "Prioritized next actions", limitations: "Evidence and limits", approval: "Approval boundary", source: "Source", confidence: "Confidence", evidence: "What we checked", manual: "Manual review", noFindings: "No findings were evaluated.", noActions: "No supported fixes are ready. Review manual actions before changing the store.", noUnavailable: "No unavailable modules.", unavailable: "Unavailable or limited evidence", impact: "Why it matters", next: "Next step", preview: "Preview required", approvalRequired: "Explicit module approval required", readOnly: "This report is read-only.", status: "Status", method: "Method", scope: "Scope", context: "Context", partial: "Some required evidence is missing or limited.", blocked: "Resolve critical blockers before launch.", ready: "Required evidence is available and no critical blocker was found.", warning: "Review the warnings before launch.", unavailableState: "Not available", noDataState: "No data", notTestedState: "Not tested", insufficientState: "Insufficient evidence", manualState: "Manual review", raw: "System raw data", scoreLabel: { Blocked: "Blocked", "Partial evidence": "Partial evidence", Ready: "Ready", "Ready with warnings": "Ready with warnings", "Needs work": "Needs work" },
  },
  "zh-CN": {
    title: "Shopify 店铺搭建审计报告", generated: "生成时间", score: "就绪度评分", coverage: "证据覆盖率", critical: "严重阻塞", findings: "审计发现", actions: "优先处理事项", limitations: "证据与限制", approval: "批准边界", source: "证据来源", confidence: "可信度", evidence: "检查依据", manual: "需人工复核", noFindings: "本次没有可评估的发现。", noActions: "目前没有可直接执行的修复；请先处理人工复核事项。", noUnavailable: "没有不可用的模块。", unavailable: "不可用或受限的证据", impact: "为什么重要", next: "下一步", preview: "需要先预览", approvalRequired: "需要明确的模块批准", readOnly: "本报告只读，不会修改店铺。", status: "状态", method: "方法", scope: "范围", context: "审计对象", partial: "部分必需证据缺失或受限。", blocked: "请先处理严重阻塞项，再考虑上线。", ready: "必需证据已具备，且没有发现严重阻塞项。", warning: "上线前请复核全部提醒。", unavailableState: "不可用", noDataState: "没有数据", notTestedState: "未测试", insufficientState: "证据不足", manualState: "需人工复核", raw: "系统原始数据", scoreLabel: { Blocked: "已阻塞", "Partial evidence": "证据不完整", Ready: "准备就绪", "Ready with warnings": "就绪但有提醒", "Needs work": "需要完善" },
  },
};

const moduleNames = {
  foundation: { en: "Foundation", "zh-CN": "基础门禁" }, domain: { en: "Domain and security", "zh-CN": "域名与安全" }, policies: { en: "Policies and trust", "zh-CN": "政策与信任" }, checkout: { en: "Checkout and payments", "zh-CN": "结账与支付" }, markets_shipping: { en: "Markets and shipping", "zh-CN": "多地区销售（Markets）与配送" }, catalog: { en: "Catalog", "zh-CN": "商品目录" }, navigation: { en: "Navigation", "zh-CN": "集合与导航" }, seo_theme: { en: "Technical SEO and theme", "zh-CN": "搜索优化（SEO）与主题" }, marketing_discounts: { en: "Discounts and tracking", "zh-CN": "折扣与追踪" }, content_trust: { en: "Trust content", "zh-CN": "内容与客服基建" },
};

const severities = { pass: { en: "Verified", "zh-CN": "已验证" }, warning: { en: "Needs attention", "zh-CN": "需要处理" }, critical: { en: "Risk", "zh-CN": "风险" }, info: { en: "Information", "zh-CN": "信息" } };

function safeJson(value) { return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"); }
function evidenceText(value) { return JSON.stringify(value, null, 2); }
function localized(value, lang) { return value?.[lang] || value?.en || String(value || ""); }
function moduleLabel(module, lang) { return localized(moduleNames[module], lang) || module; }
function severityLabel(severity, lang) { return localized(severities[severity], lang) || severity; }
function confidenceLabel(value, lang) {
  const map = { high: { en: "High", "zh-CN": "高" }, medium: { en: "Medium", "zh-CN": "中" }, low: { en: "Low", "zh-CN": "低" } };
  return localized(map[String(value || "medium")], lang) || String(value || "medium");
}
function scoreLabel(label, copy) { return copy.scoreLabel[label] || label; }

function findingTitle(item, lang) {
  if (lang === "en") return item.title;
  const outcome = item.severity === "pass" ? "此检查项已通过。" : item.severity === "critical" ? "此检查项会阻塞上线。" : item.severity === "warning" ? "此检查项需要处理或人工复核。" : "此检查项提供补充信息。";
  return `${moduleLabel(item.module, lang)}：${outcome}`;
}

function findingImpact(item, copy) {
  if (item.severity === "critical") return copy.blocked;
  if (item.severity === "warning") return copy.warning;
  return copy.readOnly;
}

function limitedState(item, copy) {
  const code = String(item.code || "");
  if (/NO_DATA|EMPTY/.test(code)) return copy.noDataState;
  if (/NOT_TESTED/.test(code)) return copy.notTestedState;
  if (/MANUAL/.test(code)) return copy.manualState;
  if (/PARTIAL|SCOPE|AUTH|CONNECTION|UNAVAILABLE/.test(code)) return copy.insufficientState;
  return copy.unavailableState;
}

function summary(score, copy) {
  if (score.label === "Blocked") return copy.blocked;
  if (score.label === "Partial evidence") return copy.partial;
  if (score.label === "Ready") return copy.ready;
  return copy.warning;
}

function renderFinding(item, lang, copy) {
  const next = item.fix ? `${copy.preview} · ${copy.approvalRequired}` : item.manual ? copy.manual : copy.readOnly;
  return `<article class="finding finding-${escapeHtml(item.severity)}"><div class="finding-heading"><span class="badge badge-${escapeHtml(item.severity)}">${escapeHtml(severityLabel(item.severity, lang))}</span><span class="module-label">${escapeHtml(moduleLabel(item.module, lang))}</span></div><h3>${escapeHtml(findingTitle(item, lang))}</h3><dl class="finding-details"><div><dt>${copy.impact}</dt><dd>${escapeHtml(findingImpact(item, copy))}</dd></div><div><dt>${copy.next}</dt><dd>${escapeHtml(next)}</dd></div><div><dt>${copy.confidence}</dt><dd>${escapeHtml(confidenceLabel(item.confidence, lang))}</dd></div></dl><details><summary>${copy.evidence}</summary><pre>${escapeHtml(evidenceText(item.evidence))}</pre>${lang === "zh-CN" ? `<p><strong>${copy.raw}:</strong> ${escapeHtml(item.title)}</p>` : ""}</details>${item.manual ? `<p class="manual-note"><strong>${copy.manual}:</strong> ${escapeHtml(evidenceText(item.manual))}</p>` : ""}</article>`;
}

function renderActions(findings, lang, copy) {
  const order = { critical: 0, warning: 1, info: 2, pass: 3 };
  const actions = findings.filter((item) => item.fix || item.manual).sort((a, b) => order[a.severity] - order[b.severity]);
  if (!actions.length) return `<p class="empty-state">${copy.noActions}</p>`;
  return `<ol class="action-list">${actions.map((item) => `<li><article class="action-card"><span class="badge badge-${escapeHtml(item.severity)}">${escapeHtml(severityLabel(item.severity, lang))}</span><div><h3>${escapeHtml(findingTitle(item, lang))}</h3><p>${escapeHtml(item.fix ? `${copy.preview}. ${copy.approvalRequired}.` : copy.manual)}</p><p class="muted">${escapeHtml(item.manual ? evidenceText(item.manual) : moduleLabel(item.module, lang))}</p></div></article></li>`).join("")}</ol>`;
}

const styles = `:root{--report-bg:#fafafa;--report-surface:#fff;--report-surface-subtle:#f8fafc;--report-border:#e4e4e7;--report-border-subtle:#f4f4f5;--report-fg:#09090b;--report-muted:#71717a;--report-subtle:#a1a1aa;--report-link:#2563eb;--report-success-fg:#15803d;--report-success-bg:#f0fdf4;--report-success-border:#bbf7d0;--report-danger-fg:#b91c1c;--report-danger-bg:#fef2f2;--report-danger-border:#fecaca;--report-warning-fg:#b45309;--report-warning-bg:#fffbeb;--report-warning-border:#fde68a;--report-info-fg:#1d4ed8;--report-info-bg:#eff6ff;--report-info-border:#bfdbfe;--report-accent-fg:#6d28d9;--report-accent-bg:#faf5ff;--report-accent-border:#e9d5ff;--report-font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans","Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif;--report-radius-sm:6px;--report-radius-md:10px;--report-radius-lg:14px;--report-shadow-subtle:0 1px 3px rgba(0,0,0,.04),0 1px 2px -1px rgba(0,0,0,.04);--report-shadow-card:0 1px 3px rgba(0,0,0,.05)}*{box-sizing:border-box}body{margin:0;background:var(--report-bg);color:var(--report-fg);font:14px/1.55 var(--report-font-sans)}main{max-width:1120px;margin:0 auto;padding:32px 20px 48px}.report-header,.summary,.kpi,.module-card,.action-card,.limitations{background:var(--report-surface);border:1px solid var(--report-border);border-radius:var(--report-radius-lg);box-shadow:var(--report-shadow-card)}.report-header{padding:28px}.eyebrow,.muted,.module-label{color:var(--report-muted);font-size:13px}.eyebrow{margin:0 0 8px;overflow-wrap:anywhere}.report-header h1{margin:0;font-size:32px;line-height:1.2;letter-spacing:-.02em}.header-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.chip,.badge{display:inline-flex;align-items:center;border:1px solid var(--report-border);border-radius:999px;padding:3px 8px;font-size:12px;font-weight:600}.summary{border-left:4px solid var(--report-info-fg);margin-top:20px;padding:16px 20px}.summary h2,.section-heading{margin:0 0 8px;font-size:18px}.summary p{margin:0}.kpi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:20px 0}.kpi{padding:18px}.kpi span,.kpi small{display:block;color:var(--report-muted)}.kpi strong{display:block;margin:4px 0;font-size:28px;line-height:1.15}.section{margin-top:28px}.module-grid{display:grid;gap:16px}.module-card{padding:20px}.module-card>h3{margin:0 0 12px;font-size:18px}.finding{border:1px solid var(--report-border-subtle);border-radius:var(--report-radius-md);padding:16px;margin-top:12px}.finding-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.finding h3,.action-card h3{margin:10px 0 8px;font-size:16px}.badge-pass{color:var(--report-success-fg);background:var(--report-success-bg);border-color:var(--report-success-border)}.badge-critical{color:var(--report-danger-fg);background:var(--report-danger-bg);border-color:var(--report-danger-border)}.badge-warning{color:var(--report-warning-fg);background:var(--report-warning-bg);border-color:var(--report-warning-border)}.badge-info{color:var(--report-info-fg);background:var(--report-info-bg);border-color:var(--report-info-border)}.finding-critical{border-left:4px solid var(--report-danger-fg)}.finding-warning{border-left:4px solid var(--report-warning-fg)}.finding-pass{border-left:4px solid var(--report-success-fg)}.finding-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}.finding-details div{background:var(--report-surface-subtle);border-radius:var(--report-radius-sm);padding:8px}.finding-details dt{color:var(--report-muted);font-size:12px}.finding-details dd{margin:2px 0 0;overflow-wrap:anywhere}details{margin-top:12px}summary{cursor:pointer;color:var(--report-link);font-weight:600}pre{max-height:320px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--report-surface-subtle);border:1px solid var(--report-border-subtle);border-radius:var(--report-radius-sm);padding:12px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.manual-note{background:var(--report-warning-bg);border:1px solid var(--report-warning-border);border-radius:var(--report-radius-sm);padding:10px}.action-list{display:grid;gap:12px;padding:0;margin:0;list-style:none}.action-card{display:flex;gap:12px;padding:16px}.action-card p{margin:4px 0}.empty-state,.limited-list{border:1px dashed var(--report-border);border-radius:var(--report-radius-md);padding:16px;color:var(--report-muted)}.limited-list{display:grid;gap:8px;list-style:none;margin:0;padding:16px}.limited-list li{display:flex;gap:8px;align-items:flex-start}.limitations{padding:20px}.limitations h2{margin-top:0;font-size:18px}.limitations h3{font-size:14px;margin:16px 0 4px}.limitations p{margin:0;color:var(--report-muted)}a:focus-visible,summary:focus-visible{outline:3px solid var(--report-link);outline-offset:3px;border-radius:var(--report-radius-sm)}@media(max-width:768px){main{padding:20px 14px}.report-header{padding:20px}.report-header h1{font-size:26px}.kpi-grid,.finding-details{grid-template-columns:1fr}.finding-details{gap:8px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}@media print{body{background:#fff}main{max-width:none;padding:0}.report-header,.summary,.kpi,.module-card,.action-card,.limitations{box-shadow:none;break-inside:avoid}details{display:block}details>summary{display:none}pre{max-height:none;overflow:visible}.section{break-inside:avoid}}`;

export async function renderReport({ lang, audit, manifest }) {
  const locale = words[lang] ? lang : "en";
  const copy = words[locale];
  const findings = audit.results.flatMap((result) => result.findings || []);
  const byModule = new Map(audit.results.filter((result) => result.findings?.length).map((result) => [result.module, result.findings]));
  const limited = audit.results.filter((result) => result.status !== "complete");
  const modules = [...byModule.entries()].map(([module, items]) => `<article class="module-card"><h3>${escapeHtml(moduleLabel(module, locale))}</h3>${items.map((item) => renderFinding(item, locale, copy)).join("")}</article>`).join("") || `<p class="empty-state">${copy.noFindings}</p>`;
  const limitedRows = limited.map((item) => `<li><span class="badge badge-info">${escapeHtml(limitedState(item, copy))}</span><span><strong>${escapeHtml(moduleLabel(item.module, locale))}</strong> · ${escapeHtml(item.detail || limitedState(item, copy))}</span></li>`).join("") || `<li>${copy.noUnavailable}</li>`;
  const label = scoreLabel(audit.score.label, copy);
  const body = `<header class="report-header"><p class="eyebrow">${copy.context}: ${escapeHtml(audit.storeUrl)}</p><h1>${copy.title}</h1><div class="header-meta"><span class="chip">${copy.generated}: ${escapeHtml(audit.generatedAt)}</span><span class="chip">${copy.readOnly}</span></div></header><section class="summary" aria-labelledby="summary-title"><h2 id="summary-title">${copy.status}: ${escapeHtml(label)}</h2><p>${escapeHtml(summary(audit.score, copy))}</p></section><section class="kpi-grid" aria-label="${copy.score}"><article class="kpi"><span>${copy.score}</span><strong>${audit.score.score}/100</strong><small>${escapeHtml(label)}</small></article><article class="kpi"><span>${copy.coverage}</span><strong>${audit.score.evidenceCoverage}%</strong><small>${audit.score.evaluatedWeight}/${audit.score.eligibleWeight}${audit.score.requiredEvidenceMissing ? ` · ${copy.partial}` : ""}</small></article><article class="kpi"><span>${copy.critical}</span><strong>${audit.score.criticalCount}</strong><small>${copy.status}: ${escapeHtml(label)}</small></article></section><section class="section" aria-labelledby="findings-title"><h2 class="section-heading" id="findings-title">${copy.findings}</h2><div class="module-grid">${modules}</div></section><section class="section" aria-labelledby="actions-title"><h2 class="section-heading" id="actions-title">${copy.actions}</h2>${renderActions(findings, locale, copy)}</section><section class="section" aria-labelledby="limited-title"><h2 class="section-heading" id="limited-title">${copy.unavailable}</h2><ul class="limited-list">${limitedRows}</ul></section><footer class="limitations"><h2>${copy.limitations}</h2><h3>${copy.method}</h3><p>${copy.readOnly} ${copy.evidence} ${copy.source}.</p><h3>${copy.scope}</h3><p>${copy.partial}</p><h3>${copy.approval}</h3><p>${copy.preview}. ${copy.approvalRequired}</p></footer>`;
  const template = await readFile(templatePath, "utf8");
  return template.replace("{{lang}}", locale).replace("{{title}}", escapeHtml(copy.title)).replace("{{styles}}", styles).replace("{{body}}", body).replace("{{manifest}}", safeJson(manifest));
}

export async function readEmbeddedManifest(reportPath) {
  const html = await readFile(reportPath, "utf8");
  const source = html.match(/<script id="shopify-store-setup-manifest" type="application\/json">([\s\S]*?)<\/script>/i)?.[1];
  if (!source) throw new Error("REPORT_MANIFEST_MISSING");
  return JSON.parse(source);
}
