#!/usr/bin/env node
/**
 * gmc-product-audit.mjs — Phase B: Product-level GMC audit + HTML report generation
 *
 * Usage:
 *   node gmc-product-audit.mjs <product-url-or-store-url> [--store <store-url>] [--out <report.html>] [--lang en|zh-CN]
 *   node gmc-product-audit.mjs <storefront-product-url>
 *   node gmc-product-audit.mjs <storefront-url> --out gmc-audit-report.html
 *
 * If a store URL is given, reads Phase A JSON from stdin (piped from gmc-store-audit.mjs),
 * audits sampled products, and generates the HTML report.
 * If a single product URL is given, audits that product only.
 *
 * Output: HTML report written to --out (default: gmc-audit-report.html in cwd)
 * No API token required. Crawls public pages only.
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fetchPublic } from './public-fetch.mjs';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function validateSafeUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Invalid protocol: "${parsed.protocol}". Only HTTP and HTTPS are allowed.`);
    }
    const hostname = parsed.hostname.toLowerCase();
    
    // Block localhost, loopbacks, and private IP ranges to prevent SSRF
    const isIp = /^[0-9.]+$/.test(hostname) || hostname.includes(":");
    if (hostname === "localhost" || 
        hostname === "127.0.0.1" || 
        hostname === "0.0.0.0" || 
        hostname.startsWith("10.") || 
        hostname.startsWith("192.168.") || 
        (hostname.startsWith("172.") && (Number(hostname.split(".")[1]) >= 16 && Number(hostname.split(".")[1]) <= 31))) {
      throw new Error(`Access to private address "${hostname}" is blocked.`);
    }
    return parsed.href;
  } catch (err) {
    throw new Error(`Invalid or unsafe URL "${value}": ${err.message}`);
  }
}

const args = process.argv.slice(2);
const optionValueFlags = new Set(['--out', '--store', '--lang', '--fixture']);
const rawTargetUrl = args.find((value, index) => !value.startsWith('--') && !optionValueFlags.has(args[index - 1]));
const outFlag = args.indexOf('--out');
const outFile = outFlag !== -1 ? args[outFlag + 1] : 'gmc-audit-report.html';
const storeFlag = args.indexOf('--store');
const rawStoreUrlArg = storeFlag !== -1 ? args[storeFlag + 1] : null;
const langFlag = args.indexOf('--lang');
const reportLang = langFlag !== -1 ? String(args[langFlag + 1] || 'en') : 'en';
const fixtureFlag = args.indexOf('--fixture');
const fixturePath = fixtureFlag !== -1 ? args[fixtureFlag + 1] : null;

if (!rawTargetUrl && !fixturePath) {
  process.stderr.write('Usage: node gmc-product-audit.mjs <url> [--store <store-url>] [--out <report.html>] [--lang en|zh-CN] | --fixture <audit.json> --out <report.html>\n');
  process.exit(1);
}

let targetUrl;
let storeUrlArg = null;
try {
  if (rawTargetUrl) targetUrl = validateSafeUrl(rawTargetUrl);
  if (rawStoreUrlArg) {
    storeUrlArg = validateSafeUrl(rawStoreUrlArg);
  }
} catch (e) {
  process.stderr.write(`Error: ${e.message}\n`);
  process.exit(1);
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchPage(url, opts = {}) {
  try {
    validateSafeUrl(url);
  } catch (e) {
    return { ok: false, status: 0, url, text: '', error: `Request blocked: ${e.message}` };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 15000);
  try {
    const res = await fetchPublic(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Selofy-GMC-Auditor/1.0',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...opts.headers,
      },
    }, { timeoutMs: opts.timeout || 15000 });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text };
  } catch (e) {
    return { ok: false, status: 0, url, text: '', error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── HTML / JSON-LD extraction ────────────────────────────────────────────────

function extractAllJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { blocks.push(JSON.parse(m[1])); } catch {}
  }
  return blocks;
}

function findProductBlocks(blocks) {
  return blocks.filter(b =>
    b['@type'] === 'Product' || b['@type'] === 'ProductGroup' ||
    (Array.isArray(b['@graph']) && b['@graph'].some(g => g['@type'] === 'Product'))
  ).flatMap(b => {
    if (Array.isArray(b['@graph'])) return b['@graph'].filter(g => g['@type'] === 'Product');
    return [b];
  });
}

function extractVisiblePrice(html) {
  // data attribute (most reliable)
  let m = /data-product-price[^>]*>\s*([0-9,]+\.?[0-9]*)/i.exec(html);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  // ShopifyAnalytics
  m = /"price"\s*:\s*([0-9]+)/.exec(html);
  if (m) return parseFloat(m[1]) / 100;
  // price class
  m = /class="[^"]*price(?!.*compare)[^"]*"[^>]*>\s*[$£€¥]?\s*([0-9,]+\.?[0-9]*)/i.exec(html);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

function extractCompareAtPrice(html) {
  // struck-through price
  let m = /<s[^>]*class="[^"]*(?:compare|was|original|regular)[^"]*"[^>]*>\s*[$£€¥]?\s*([0-9,]+\.?[0-9]*)/i.exec(html);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  m = /compare[_-]at[_-]price[^>]*>\s*[$£€¥]?\s*([0-9,]+\.?[0-9]*)/i.exec(html);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

function extractButtonState(html) {
  // Add to cart button
  const btnRe = /<button[^>]*(?:id="[^"]*(?:add-to-cart|AddToCart|ProductSubmitButton)[^"]*"|class="[^"]*(?:add-to-cart|btn-cart)[^"]*")[^>]*>([\s\S]*?)<\/button>/i;
  const m = btnRe.exec(html);
  if (!m) return { found: false };
  const disabled = /disabled/i.test(m[0]);
  const text = m[1].replace(/<[^>]+>/g, '').trim();
  return { found: true, disabled, text };
}

function extractText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectTheme(html) {
  if (/product__title/.test(html)) return 'dawn';
  if (/product-single__title/.test(html)) return 'impulse';
  if (/prd-block/.test(html)) return 'shella';
  return 'unknown';
}

// ─── Product-level checks ─────────────────────────────────────────────────────

function runProductChecks(html, url) {
  const checks = [];
  const jsonLdBlocks = extractAllJsonLd(html);
  const productBlocks = findProductBlocks(jsonLdBlocks);
  const visiblePrice = extractVisiblePrice(html);
  const compareAtPrice = extractCompareAtPrice(html);
  const buttonState = extractButtonState(html);
  const pageText = extractText(html);

  // PQ-01: Visible price vs JSON-LD price
  if (productBlocks.length > 0 && visiblePrice !== null) {
    for (const pb of productBlocks) {
      const offers = Array.isArray(pb.offers) ? pb.offers : pb.offers ? [pb.offers] : [];
      for (const offer of offers) {
        const ldPrice = parseFloat(offer.price);
        if (!isNaN(ldPrice) && Math.abs(ldPrice - visiblePrice) > 0.02) {
          checks.push({
            id: 'price_mismatch:dom_vs_jsonld',
            severity: 'critical', confidence: 0.95,
            message: `Visible price ($${visiblePrice}) does not match JSON-LD offer price ($${ldPrice})`,
            evidence: { visiblePrice, jsonLdPrice: ldPrice },
            policyBasis: 'Landing page price must match submitted product data',
          });
          break;
        }
      }
    }
  }

  // PQ-02: Compare-at price (risk signal)
  if (compareAtPrice !== null && visiblePrice !== null && compareAtPrice > visiblePrice) {
    const discountPct = Math.round((1 - visiblePrice / compareAtPrice) * 100);
    checks.push({
      id: 'price_mismatch:compare_at_present',
      severity: 'medium', confidence: 0.7,
      message: `Compare-at / was price detected (${discountPct}% off) — verify this reflects a genuine historical price`,
      evidence: { visiblePrice, compareAtPrice, discountPct },
      policyBasis: 'Misleading discounts are a GMC Misrepresentation risk signal',
    });
  }

  // PQ-05: JSON-LD availability vs button state
  if (productBlocks.length > 0 && buttonState.found) {
    for (const pb of productBlocks) {
      const offers = Array.isArray(pb.offers) ? pb.offers : pb.offers ? [pb.offers] : [];
      for (const offer of offers) {
        const avail = (offer.availability || '').toLowerCase();
        const isLdInStock = avail.includes('instock') || avail.includes('in_stock');
        if (isLdInStock && buttonState.disabled) {
          checks.push({
            id: 'availability_conflict:button_vs_jsonld',
            severity: 'critical', confidence: 0.95,
            message: `JSON-LD says InStock but Add to Cart button is disabled`,
            evidence: { jsonLdAvailability: offer.availability, buttonDisabled: true, buttonText: buttonState.text },
            policyBasis: 'Customers must be able to buy in-stock products',
          });
        }
        if (!isLdInStock && avail && !buttonState.disabled) {
          checks.push({
            id: 'availability_conflict:jsonld_says_outofstock',
            severity: 'high', confidence: 0.85,
            message: `JSON-LD says OutOfStock but Add to Cart button appears active`,
            evidence: { jsonLdAvailability: offer.availability, buttonDisabled: false },
            policyBasis: 'Availability must be consistent across page and structured data',
          });
        }
      }
    }
  }

  // PQ-06 / PQ-07: Unverifiable / medical claims in ALL product blocks
  const claimPatterns = [
    { re: /\b(?:cure[sd]?|clinically proven|FDA[- ](?:approved|cleared)|guaranteed cure|miracle|100%\s+effective)\b/i, severity: 'critical', type: 'medical' },
    { re: /\b(?:treats?|heals?|eliminates?|reverses?)\s+(?:cancer|diabetes|depression|anxiety|pain)\b/i, severity: 'critical', type: 'medical' },
    { re: /\b(?:certified organic|USDA organic|non-?GMO verified)\b/i, severity: 'medium', type: 'eco_cert' },
    { re: /\b(?:carbon neutral|net zero|plastic free|B Corp)\b/i, severity: 'medium', type: 'eco_claim' },
  ];

  const allDescriptionText = [
    pageText,
    ...productBlocks.map(pb => JSON.stringify(pb.description || '')),
  ].join(' ');

  for (const { re, severity, type } of claimPatterns) {
    const m = allDescriptionText.match(re);
    if (m) {
      checks.push({
        id: `claim_unverified:${type}`,
        severity, confidence: 0.75,
        message: `Unverifiable ${type} claim detected: "${m[0]}" — must be substantiated or removed`,
        evidence: { claim: m[0] },
        policyBasis: type === 'medical'
          ? 'Health claims must be substantiated — unsubstantiated claims = egregious violation'
          : 'Eco/certification claims must link to verifiable third-party sources',
      });
    }
  }

  // PQ-08: Badge/trust seals without working links
  const badgeRe = /(?:secure|ssl|verified|trusted|safe|guarantee)[^"'<>]*(?:badge|seal|icon|logo)/gi;
  if (badgeRe.test(html)) {
    checks.push({
      id: 'trust:badge_without_link',
      severity: 'high', confidence: 0.6,
      message: 'Trust badge/seal detected — verify it links to an official third-party verification page',
      policyBasis: 'Badges must come from official third-party sources',
    });
  }

  // PQ-11: Missing GTIN/MPN/brand
  // Check across ALL product blocks — only flag if EVERY block lacks it
  // Also check within offers[] for gtin12/gtin8 fallback
  function hasGtin(pb) {
    if (pb.gtin || pb.gtin12 || pb.gtin13 || pb.gtin14 || pb.gtin8 || pb.mpn) return true;
    // Check offers for nested GTIN
    const offers = Array.isArray(pb.offers) ? pb.offers : pb.offers ? [pb.offers] : [];
    return offers.some(o => o.gtin || o.gtin12 || o.gtin13 || o.gtin14 || o.gtin8);
  }
  function hasBrand(pb) {
    return !!(pb.brand || pb['brand']);
  }
  const allMissing = productBlocks.length > 0 && productBlocks.every(pb => !hasGtin(pb));
  const brandMissing = productBlocks.length > 0 && productBlocks.every(pb => !hasBrand(pb));
  const missingParts = [];
  if (allMissing) missingParts.push('gtin/mpn');
  if (brandMissing) missingParts.push('brand');
  if (missingParts.length > 0) {
    checks.push({
      id: 'schema:missing_gtin',
      severity: 'medium', confidence: 0.9,
      message: `Product JSON-LD missing: ${missingParts.join(', ')}`,
      policyBasis: 'GTIN/MPN/brand improve feed matching and product eligibility',
    });
  }

  // PQ-12: Empty schema fields
  const emptyFields = [];
  for (const pb of productBlocks) {
    if (pb.color === '') emptyFields.push('color');
    if (pb.material === '') emptyFields.push('material');
    if (pb.size === '') emptyFields.push('size');
  }
  if (emptyFields.length > 0) {
    checks.push({
      id: `schema:empty_fields`,
      severity: 'medium', confidence: 0.85,
      message: `Empty schema fields found: ${emptyFields.join(', ')}`,
      policyBasis: 'Empty schema fields reduce product data quality',
    });
  }

  // PQ-13: Stale year
  const currentYear = new Date().getFullYear();
  const staleYearRe = new RegExp(`\\b(${currentYear - 2}|${currentYear - 3}|${currentYear - 4})\\b`);
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
  if (staleYearRe.test(metaDesc) || staleYearRe.test(pageText.slice(0, 500))) {
    checks.push({
      id: 'stale_year:description_or_meta',
      severity: 'medium', confidence: 0.8,
      message: `Stale year (${currentYear - 2} or older) found in meta description or product description`,
      policyBasis: 'Stale content signals outdated/inactive store',
    });
  }

  // PQ-14: Liquid errors on product page
  if (/Liquid error:/i.test(html)) {
    checks.push({
      id: 'technical:liquid_error:product_page',
      severity: 'critical', confidence: 1.0,
      message: 'Liquid template error on product page — known automatic GMC suspension trigger',
      evidence: html.match(/Liquid error:[^\n<]*/i)?.[0],
      policyBasis: 'Shopify Liquid errors trigger automatic GMC suspension',
    });
  }

  // PQ-15: Dropshipping supplier patterns in product description
  const descText = pageText.toLowerCase();
  const supplierKeywords = [
    /\b(?:origin|manufacturer|supplier|factory)\s*(?::|is|from)?\s*(?:cn|china|shenzhen|guangzhou|hong kong)\b/i,
    /\b(?:cm|mm|kg|g|ml)\s*(?:\*|x)\s*(?:\d+)/i,  // China-style spec measurements
    /\b(?:material|color|size|weight|dimension)\s*[:：].*(?:abs|plastic|nylon|stainless|alloy)\b/i,
    /\b(?:package\s+include|package\s+list|package\s+content|what's\s+in\s+the\s+box)\b/i,
    /\b(?:wholesale|bulk\s+order|drop\s*shipping|dropshipping|moq|minimum\s+order)\b/i,
  ];
  const matchedSupplier = supplierKeywords.filter(p => p.test(html));
  if (matchedSupplier.length >= 2) {
    checks.push({
      id: 'dropship:supplier_description_patterns',
      severity: 'medium', confidence: 0.65,
      message: `Product description contains ${matchedSupplier.length} supplier/dropshipping patterns (spec measurements, China origin, wholesale terms)`,
      evidence: { matchedCount: matchedSupplier.length },
      policyBasis: 'Supplier-origin product text indicates possible undisclosed dropshipping',
    });
  }

  // PQ-16: Product description is very thin (AI-bulk signal)
  const descWords = pageText.split(/\s+/).length;
  if (descWords > 0 && descWords < 50) {
    checks.push({
      id: 'dropship:thin_product_description',
      severity: 'medium', confidence: 0.6,
      message: `Product page has very thin content (${descWords} words) — typical of bulk-imported/AI-generated listings`,
      evidence: { wordCount: descWords },
      policyBasis: 'Thin product content signals possible auto-generated listings',
    });
  }

  return {
    url,
    checks,
    meta: {
      visiblePrice,
      compareAtPrice,
      buttonState,
      jsonLdBlockCount: jsonLdBlocks.length,
      productBlockCount: productBlocks.length,
      theme: detectTheme(html),
    },
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function computeScore(checks) {
  const weights = { critical: 25, high: 12, medium: 5, low: 2 };
  let total = 0;
  for (const c of checks) {
    total += (weights[c.severity] || 0) * (c.confidence || 0.7) * (c.evidenceFactor || 1.0);
  }
  const risk = Math.min(100, Math.round(total));
  return { risk };
}

// ─── Systemic pattern detection ───────────────────────────────────────────────

function detectSystemicPatterns(productResults) {
  const sigCounts = {};
  for (const pr of productResults) {
    for (const c of pr.checks) {
      sigCounts[c.id] = (sigCounts[c.id] || 0) + 1;
    }
  }
  const total = productResults.length;
  const patterns = [];
  for (const [sig, count] of Object.entries(sigCounts)) {
    const pct = count / total;
    if (pct >= 0.3) {
      patterns.push({
        signature: sig,
        count,
        pct: Math.round(pct * 100),
        scope: pct >= 0.6 ? 'store-wide' : pct >= 0.2 ? 'collection-level' : 'single-product',
        scopeMultiplier: pct >= 0.6 ? 2.5 : pct >= 0.2 ? 1.5 : 1.0,
      });
    }
  }
  return patterns.sort((a, b) => b.count - a.count);
}

export { fetchPage, sleep, runProductChecks, computeScore, detectSystemicPatterns, extractAllJsonLd, findProductBlocks };


// ─── HTML Report Generator ────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function safeReportHref(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch { return '#'; }
}

function localizeGmcHtml(html) {
  if (!reportLang.toLowerCase().startsWith('zh')) return html;
  const pairs = [
    ['GMC Misrepresentation Audit', 'GMC 失实陈述风险审计'], ['Risk Score', '风险分数'], ['Critical', '严重'], ['High', '高'], ['Medium', '中'], ['Products', '商品'],
    ['Priority Findings — Critical &amp; High', '优先发现 — 严重与高风险'], ['Advisory Findings — Medium &amp; Low', '提示发现 — 中低风险'], ['Severity', '严重程度'], ['Finding', '发现'], ['Policy Basis', '政策依据'],
    ['Policy Pages Discovered', '已发现的政策页面'], ['Policy', '政策'], ['URL', '链接'], ['Not found', '未找到'], ['Product-Level Detail', '商品层级详情'], ['Systemic Patterns', '系统性模式'], ['Signature', '特征'], ['Count', '数量'], ['Scope', '范围'],
    ['Manual Checklist', '人工核对清单'], ['Items that cannot be verified by crawling. Complete before submitting a GMC appeal.', '以下项目无法通过抓取验证。提交 GMC 申诉前请完成核对。'], ['Remediation Plan', '修复计划'], ['Official GMC Reference Documentation', '官方 GMC 参考文档'],
    ['Verify all findings against Google\'s official policy pages. These are the authoritative sources.', '请根据 Google 官方政策页面核实所有发现；它们才是权威来源。'], ['For Reference Only', '仅供参考'], ['Generated by Selofy Skill Hub', '由 Selofy Skill Hub 生成'], ['Read-only crawl', '只读抓取'], ['final authority is Google Merchant Center', '最终裁定权属于 Google Merchant Center'],
    ['No issues found', '未发现问题'], ['issue(s)', '项问题'], ['Theme:', '主题：'], ['Products discovered:', '发现商品：'], ['Audited:', '已审计：'], ['Scan:', '扫描时间：'], ['Products discovered:', '发现商品：'],
    ['AI Bulk / Dropshipping Assessment', 'AI 批量铺货 / 代发货评估'], ['Custom domain configured', '已配置自定义域名'], ['Catalog size vs brand presence', '商品目录规模与品牌呈现'], ['Supplier fulfillment patterns', '供应商履约模式'], ['Product description quality', '商品描述质量'],
    ['Never submit a GMC appeal until Phase 1 and Phase 2 are fully resolved.', '在第一阶段和第二阶段完全解决前，请勿提交 GMC 申诉。']
    ,['MC-01 — GMC Account vs Website', 'MC-01 — GMC 账户与网站'], ['Business name in GMC matches website footer exactly (Inc./LLC/Ltd. suffixes matter)', 'GMC 中的企业名称与网站页脚完全一致（包括 Inc./LLC/Ltd. 等后缀）'], ['Business address in GMC matches address on website', 'GMC 中的企业地址与网站地址一致'], ['Phone number in GMC matches phone on website contact page', 'GMC 中的电话号码与网站联系页面一致'], ['Website domain in GMC matches actual store domain (www vs non-www)', 'GMC 中的网站域名与实际店铺域名一致（包括 www 与非 www）'],
    ['MC-02 — Feed vs Landing Page', 'MC-02 — Feed 与落地页'], ['Product prices in GMC feed match prices on product pages', 'GMC Feed 中的商品价格与商品页一致'], ['Availability in feed matches availability on product pages', 'Feed 中的可售状态与商品页一致'], ['Product titles in feed match H1 on landing pages', 'Feed 中的商品标题与落地页 H1 一致'], ['Currency in feed matches currency on product pages', 'Feed 中的货币与商品页一致'],
    ['MC-03 — Shipping Settings', 'MC-03 — 配送设置'], ['Free shipping threshold in GMC matches website claim', 'GMC 中的免运费门槛与网站声明一致'], ['Shipping countries in GMC match shipping policy', 'GMC 中的配送国家与配送政策一致'], ['Delivery estimates in GMC match shipping policy', 'GMC 中的送达时间预估与配送政策一致'],
    ['MC-04 — Return Policy Operability', 'MC-04 — 退货政策可执行性'], ['Return request process actually works', '退货申请流程实际可用'], ['Return address is real and deliverable', '退货地址真实且可投递'], ['Refund method in policy is available at checkout', '政策中的退款方式可在结账流程中使用'],
    ['MC-05 — Reviews', 'MC-05 — 评价'], ['Review platform is properly connected and reviews are genuine', '评价平台连接正常，且评价真实'], ['Review count on page matches platform dashboard', '页面评价数量与平台后台一致'],
    ['MC-06 — Business Legitimacy', 'MC-06 — 企业真实性'], ['Business is legally registered in its stated jurisdiction', '企业在声明的司法辖区内合法注册'], ['All certifications and awards are current and verifiable', '所有认证与奖项均为最新且可验证'], ['"As Seen On" logos are accurate with real coverage', '“曾被报道”标识准确并有真实报道支持'],
    ['MC-07 — Checkout', 'MC-07 — 结账'], ['Add-to-cart works for all in-stock products', '所有有库存商品均可加入购物车'], ['Checkout completes without errors', '结账可以无错误完成'], ['No unexpected fees appear at checkout', '结账时不会出现意外费用'],
    ['🔴 Phase 1 — Today: False Claims &amp; Identity', '🔴 第一阶段 — 今日：虚假声明与身份信息'], ['Remove unverifiable claims. Fix business identity. Fix Liquid errors. Do not appeal until complete.', '移除无法验证的声明，修复企业身份信息和 Liquid 错误；完成前不要申诉。'], ['🔴 Phase 2 — This Week: Policies &amp; Purchase Path', '🔴 第二阶段 — 本周：政策与购买路径'], ['Fix empty/missing policy pages. Verify add-to-cart. Add return address. Align free-shipping claims. Complete MC-01 &amp; MC-02.', '修复空白或缺失的政策页面，验证加购，补充退货地址，并统一免运费声明；完成 MC-01 与 MC-02。'], ['🟠 Phase 3 — This Month: Schema &amp; Data Quality', '🟠 第三阶段 — 本月：结构化数据与数据质量'], ['Populate GTIN/MPN/brand. Update stale content. Fix broken policy links.', '补齐 GTIN/MPN/品牌，更新过期内容，修复失效政策链接。'], ['🟡 Phase 4 — Ongoing: Trust &amp; Freshness', '🟡 第四阶段 — 持续：信任与时效'], ['Monitor feed vs page consistency. Rescan after catalog changes.', '持续监控 Feed 与页面一致性；商品目录变动后重新扫描。']
  ];
  return pairs.reduce((value, [from, to]) => value.replaceAll(from, to), html);
}

function severityBadge(s) {
  const map = { critical: '#dc2626', high: '#d97706', medium: '#6366f1', low: '#6b7280' };
  return `<span class="severity severity-${escapeHtml(s || 'low')}">${escapeHtml(s || 'low')}</span>`;
}

function renderRawEvidence(evidence) {
  if (!evidence) return '';
  const rawEvidenceLabel = reportLang.toLowerCase().startsWith('zh') ? 'Raw evidence（原始证据）' : 'Raw evidence';
  return `<div class="evidence-snippet"><strong>${rawEvidenceLabel}:</strong> ${escapeHtml(JSON.stringify(evidence))}</div>`;
}

function checkRow(c) {
  const ev = renderRawEvidence(c.evidence);
  return `
  <tr style="border-bottom:1px solid #e2e8f0">
    <td style="padding:10px 8px;vertical-align:top">${severityBadge(c.severity)}</td>
    <td style="padding:10px 8px;vertical-align:top;font-size:0.85rem;color:#1e293b">${escapeHtml(c.message)}${ev}</td>
    <td style="padding:10px 8px;vertical-align:top;font-size:0.78rem;color:#64748b">${escapeHtml(c.policyBasis || '')}</td>
  </tr>`;
}

function generateHtmlReport({ storeUrl, fetchedAt, storeChecks, productResults, systemicPatterns, overallScore, policies, themeHints, sampledCount, totalDiscovered, dropshippingSignals }) {
  // Dropshipping signal assessment
  const dsSignals = dropshippingSignals || {};
  const dsSignalCount = Object.values(dsSignals).filter(Boolean).length;
  let dsLevel, dsColor, dsLabel;
  if (dsSignalCount >= 3) { dsLevel = 'high'; dsColor = '#dc2626'; dsLabel = 'High — Strong AI-bulk / Dropshipping indicators'; }
  else if (dsSignalCount >= 1) { dsLevel = 'suspected'; dsColor = '#d97706'; dsLabel = 'Suspected — Some AI-bulk / Dropshipping indicators found'; }
  else { dsLevel = 'low'; dsColor = '#16a34a'; dsLabel = 'Low — No obvious AI-bulk or Dropshipping indicators'; }
  const allChecks = [...storeChecks, ...productResults.flatMap(p => p.checks)];
  const critCount = allChecks.filter(c => c.severity === 'critical').length;
  const highCount = allChecks.filter(c => c.severity === 'high').length;
  const medCount  = allChecks.filter(c => c.severity === 'medium').length;

  // Group critical+high findings for the top summary table
  const priorityChecks = allChecks.filter(c => c.severity === 'critical' || c.severity === 'high');

  const priorityRows = priorityChecks.map(c => `
  <tr>
    <td>${severityBadge(c.severity)}</td>
    <td style="font-size:.85rem;color:#1e293b;padding:8px 6px">${escapeHtml(c.message)}${renderRawEvidence(c.evidence)}</td>
    <td style="font-size:.75rem;color:#64748b;padding:8px 6px">${escapeHtml(c.policyBasis || '')}</td>
  </tr>`).join('');

  // Deduplicate identical medium/low findings by combining id + first 80 chars of message
  const medLowGroups = {};
  const rawMedLow = allChecks.filter(c => c.severity === 'medium' || c.severity === 'low');
  for (const c of rawMedLow) {
    const key = `${c.id}::${JSON.stringify(c.policyBasis)}`;
    if (!medLowGroups[key]) {
      medLowGroups[key] = { ...c, count: 1 };
    } else {
      medLowGroups[key].count++;
    }
  }
  const medLowRows = Object.values(medLowGroups).map(c => `
  <tr>
    <td>${severityBadge(c.severity)}</td>
    <td style="font-size:.83rem;color:#334155;padding:6px">${escapeHtml(c.message)}${renderRawEvidence(c.evidence)}${c.count > 1 ? ` <strong style="color:#6366f1">(×${escapeHtml(c.count)})</strong>` : ''}</td>
    <td style="font-size:.73rem;color:#94a3b8;padding:6px">${escapeHtml(c.policyBasis || '')}</td>
  </tr>`).join('');

  // Policy table — handle both {url,isCanonical} objects and plain strings (backward compat)
  const policyRows = Object.entries(policies || {}).map(([k, val]) => {
    const url = val && typeof val === 'object' ? val.url : val;
    const isCanonical = val && typeof val === 'object' ? val.isCanonical : true;
    const tag = !isCanonical ? ' <span style="font-size:.7rem;background:#fef9c3;color:#854d0e;padding:1px 6px;border-radius:4px;margin-left:4px">non-canonical</span>' : '';
    return `<tr>
      <td style="padding:7px 8px;font-size:.85rem;text-transform:capitalize;font-weight:500">${escapeHtml(k)}</td>
      <td style="padding:7px 8px;font-size:.82rem">${url ? `<a href="${escapeHtml(safeReportHref(url))}" style="color:#2563eb" rel="noopener noreferrer">${escapeHtml(url)}</a>${tag}` : '<span style="color:#dc2626;font-weight:600">Not found</span>'}</td>
    </tr>`;
  }).join('');

  const productSections = productResults.map(pr => {
    if (pr.checks.length === 0) return `<div style="padding:10px 14px;background:#f0fdf4;border-radius:8px;font-size:.85rem;color:#16a34a;margin-bottom:8px">✓ ${escapeHtml(pr.url)} — No issues found</div>`;
    return `<details style="margin-bottom:10px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <summary style="background:#f8fafc;padding:9px 14px;font-size:.83rem;font-weight:600;color:#475569;cursor:pointer;list-style:none">${escapeHtml(pr.url)} — ${escapeHtml(pr.checks.length)} issue(s)</summary>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f1f5f9"><th style="padding:7px 8px;text-align:left;font-size:.73rem;color:#64748b">Sev</th><th style="padding:7px 8px;text-align:left;font-size:.73rem;color:#64748b">Finding</th></tr></thead>
        <tbody>${pr.checks.map(c => `<tr style="border-top:1px solid #f1f5f9"><td style="padding:7px 8px;vertical-align:top">${severityBadge(c.severity)}</td><td style="padding:7px 8px;font-size:.83rem;color:#1e293b">${escapeHtml(c.message)}${renderRawEvidence(c.evidence)}</td></tr>`).join('')}</tbody>
      </table>
    </details>`;
  }).join('');

  const patternRows = systemicPatterns.map(p => `
  <tr style="border-top:1px solid #f1f5f9">
    <td style="padding:7px 8px;font-size:.82rem;font-family:monospace">${escapeHtml(p.signature)}</td>
    <td style="padding:7px 8px;font-size:.82rem;text-align:center">${escapeHtml(p.count)}</td>
    <td style="padding:7px 8px;font-size:.82rem;text-align:center">${escapeHtml(p.pct)}%</td>
    <td style="padding:7px 8px;font-size:.82rem">${escapeHtml(p.scope)}</td>
  </tr>`).join('');

  return localizeGmcHtml(`<!DOCTYPE html>
<html lang="${reportLang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GMC Audit — ${escapeHtml(storeUrl)}</title>
<style>
:root{--report-bg:#fafafa;--report-surface:#fff;--report-surface-subtle:#f8fafc;--report-border:#e4e4e7;--report-fg:#09090b;--report-muted:#71717a;--report-link:#2563eb;--report-success-fg:#15803d;--report-success-bg:#f0fdf4;--report-success-border:#bbf7d0;--report-danger-fg:#b91c1c;--report-danger-bg:#fef2f2;--report-danger-border:#fecaca;--report-warning-fg:#b45309;--report-warning-bg:#fffbeb;--report-warning-border:#fde68a;--report-info-fg:#1d4ed8;--report-info-bg:#eff6ff;--report-info-border:#bfdbfe;--report-accent-fg:#6d28d9;--report-accent-bg:#faf5ff;--report-accent-border:#e9d5ff;--report-font:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans","Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif;--report-radius-sm:6px;--report-radius-md:10px;--report-radius-lg:14px;--report-shadow:0 1px 3px rgba(0,0,0,.05)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--report-font);background:var(--report-bg);color:var(--report-fg);line-height:1.55}
.wrap{max-width:1060px;margin:0 auto;padding:0 1.25rem 3rem}
h2{font-size:1.1rem;font-weight:700;margin-bottom:10px}
.hdr{background:var(--report-surface);color:var(--report-fg);border:1px solid var(--report-border);padding:2rem 1.5rem 1.5rem}
.hdr h1{font-size:1.6rem;font-weight:700}
.hdr .sub{font-size:.82rem;color:var(--report-muted);margin-top:.25rem}
.disclaimer{background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:.75rem 1rem;font-size:.82rem;color:#78350f;margin:1.25rem 0}
.disclaimer strong{display:block;margin-bottom:2px}
.card{background:var(--report-surface);border:1px solid var(--report-border);border-radius:var(--report-radius-md);padding:1.25rem;margin-bottom:1.25rem;box-shadow:var(--report-shadow)}
.score-row{display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap}
.score-num{font-size:2.6rem;font-weight:800;line-height:1}
.score-num.low{color:#16a34a}.score-num.moderate{color:#d97706}.score-num.high{color:#dc2626}

.chips{display:flex;gap:.6rem;flex-wrap:wrap}
.chip{padding:.35rem .8rem;border-radius:6px;background:#f8fafc;text-align:center;min-width:60px}
.chip .n{font-size:1.2rem;font-weight:700}.chip .l{font-size:.65rem;color:#64748b;text-transform:uppercase}
.n.c{color:#dc2626}.n.h{color:#d97706}.n.m{color:#6366f1}

table{width:100%;border-collapse:collapse}
th{padding:7px 8px;text-align:left;font-size:.72rem;color:#64748b;background:#f8fafc;font-weight:600}
td{padding:7px 8px;vertical-align:top;border-top:1px solid #f1f5f9}

.phase{padding:10px 14px;border-radius:7px;margin-bottom:8px;font-size:.84rem}
.p1,.p2{background:#fef2f2;border-left:4px solid #dc2626}
.p3{background:#fff7ed;border-left:4px solid #d97706}
.p4{background:#fefce8;border-left:4px solid #ca8a04}
.phase strong{display:block;font-weight:700;margin-bottom:3px}
.cl{list-style:none;padding:0}
.cl li{padding:6px 0;border-top:1px solid #f1f5f9;display:flex;gap:8px;font-size:.84rem;align-items:flex-start}
.cl li input{margin-top:3px;flex-shrink:0}
.cg{margin-bottom:1.25rem}
.cg h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid #e2e8f0}
.ref-link{display:inline-block;margin:3px 4px 3px 0;padding:3px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;font-size:.78rem;color:#1d4ed8;text-decoration:none}
.ref-link:hover{background:#dbeafe}
.severity{display:inline-flex;align-items:center;border:1px solid var(--report-border);border-radius:var(--report-radius-sm);padding:3px 8px;font-size:.75rem;font-weight:700;text-transform:uppercase}.severity-critical{background:var(--report-danger-bg);color:var(--report-danger-fg);border-color:var(--report-danger-border)}.severity-high{background:var(--report-warning-bg);color:var(--report-warning-fg);border-color:var(--report-warning-border)}.severity-medium{background:var(--report-info-bg);color:var(--report-info-fg);border-color:var(--report-info-border)}.severity-low{background:var(--report-surface-subtle);color:var(--report-muted)}.evidence-snippet{font-size:.78rem;color:var(--report-muted);margin-top:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--report-surface-subtle);padding:4px 8px;border-radius:var(--report-radius-sm);overflow-wrap:anywhere}.footer{text-align:center;font-size:.75rem;color:var(--report-muted);padding:1.5rem 0}a:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid var(--report-info-fg);outline-offset:2px}@media(max-width:768px){.wrap{padding:0 12px 24px}table{min-width:640px}.card{overflow-x:auto}.score-row{align-items:flex-start}}@media(max-width:480px){.hdr{padding:20px 12px}.chips{display:grid;grid-template-columns:1fr 1fr}.chip{min-width:0}}@media print{body{background:#fff}.hdr,.card{box-shadow:none}.card,tr{break-inside:avoid}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
</style>
</head>
<body>
<header class="hdr">
  <div style="max-width:1060px;margin:0 auto">
    <h1>GMC Misrepresentation Audit</h1>
    <div class="sub">${escapeHtml(storeUrl)} &nbsp;·&nbsp; ${escapeHtml(new Date(fetchedAt).toLocaleString(reportLang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'))} &nbsp;·&nbsp; ${escapeHtml(sampledCount)} product(s) audited of ${escapeHtml(totalDiscovered)} discovered</div>
  </div>
</header>
<main class="wrap" aria-label="GMC audit report">

  <div class="disclaimer">
    <strong>⚠️ Disclaimer — For Reference Only</strong>
    This report is generated by automated crawling and heuristic analysis. It is provided for informational purposes only and does not constitute legal or compliance advice. Findings may include false positives or miss issues that require human judgment. <strong>The final authority on GMC policy compliance is Google Merchant Center itself.</strong> Always verify findings directly in your GMC account and consult Google's official policy documentation before taking action or submitting an appeal.
  </div>

  <div class="card">
    <div class="score-row">
      <div>
        <div style="font-size:.68rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Risk Score</div>
        <div class="score-num ${overallScore.risk < 20 ? 'low' : overallScore.risk < 50 ? 'moderate' : 'high'}">${overallScore.risk}<span style="font-size:1rem;font-weight:400;color:#94a3b8"> /100</span></div>
      </div>
      <div class="chips">
        <div class="chip"><div class="n c">${critCount}</div><div class="l">Critical</div></div>
        <div class="chip"><div class="n h">${highCount}</div><div class="l">High</div></div>
        <div class="chip"><div class="n m">${medCount}</div><div class="l">Medium</div></div>
        <div class="chip"><div class="n" style="color:#16a34a">${sampledCount}</div><div class="l">Products</div></div>
      </div>
    </div>
  </div>

  ${priorityChecks.length > 0 ? `
  <div class="card">
    <h2>🚨 Priority Findings — Critical &amp; High</h2>
    <table>
      <thead><tr><th style="width:90px">Severity</th><th>Finding</th><th style="width:220px">Policy Basis</th></tr></thead>
      <tbody>${priorityRows}</tbody>
    </table>
  </div>` : ''}

  ${medLowRows ? `
  <div class="card">
    <h2>Advisory Findings — Medium &amp; Low</h2>
    <table>
      <thead><tr><th style="width:90px">Severity</th><th>Finding</th><th style="width:220px">Policy Basis</th></tr></thead>
      <tbody>${medLowRows}</tbody>
    </table>
  </div>` : ''}

  ${policyRows ? `
  <div class="card">
    <h2>Policy Pages Discovered</h2>
    <table><thead><tr><th style="width:100px">Policy</th><th>URL</th></tr></thead><tbody>${policyRows}</tbody></table>
    <p style="font-size:.75rem;color:#94a3b8;margin-top:8px">Non-canonical = served from /pages/ path. Consider migrating to Shopify's canonical /policies/ path for better GMC reliability.</p>
  </div>` : ''}

  ${dsSignalCount > 0 || allChecks.some(c => c.id.startsWith('dropship:')) ? `
  <div class="card">
    <h2>🧬 AI Bulk / Dropshipping Assessment</h2>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <span style="background:${dsColor};color:#fff;padding:4px 14px;border-radius:6px;font-weight:700;font-size:0.9rem">${dsLevel.toUpperCase()}</span>
      <span style="font-size:.85rem;color:#475569">${dsLabel}</span>
    </div>
    <p style="font-size:.82rem;color:#64748b;margin-bottom:10px">The following automated signals were detected from crawling. <strong>Agent-assisted web search is required</strong> to complete the assessment (see SKILL.md).</p>
    <table>
      <thead><tr><th style="width:40%">Signal</th><th>Status</th><th style="width:200px">Detail</th></tr></thead>
      <tbody>
        <tr><td style="padding:7px 8px;font-size:.84rem">Custom domain configured</td><td style="padding:7px 8px">${dsSignals.noCustomDomain ? '<span style="color:#dc2626;font-weight:600">✗ No custom domain</span>' : '<span style="color:#16a34a">✓ Custom domain found</span>'}</td><td style="padding:7px 8px;font-size:.8rem;color:#64748b">${dsSignals.noCustomDomain ? '.myshopify.com only — low barrier to launch' : ''}</td></tr>
        <tr><td style="padding:7px 8px;font-size:.84rem">Catalog size vs brand presence</td><td style="padding:7px 8px">${dsSignals.productCountSignal === 'high' ? '<span style="color:#dc2626;font-weight:600">Large catalog</span>' : dsSignals.productCountSignal === 'moderate' ? '<span style="color:#d97706">Moderate catalog</span>' : '<span style="color:#16a34a">Small catalog</span>'}</td><td style="padding:7px 8px;font-size:.8rem;color:#64748b">${totalDiscovered} products found</td></tr>
        <tr><td style="padding:7px 8px;font-size:.84rem">Supplier fulfillment patterns</td><td style="padding:7px 8px">${dsSignals.chinaPatterns ? '<span style="color:#d97706">Supplier patterns detected</span>' : '<span style="color:#16a34a">None detected on homepage</span>'}</td><td style="padding:7px 8px;font-size:.8rem;color:#64748b">${dsSignals.chinaPatterns ? 'China warehouse / processing time patterns' : ''}</td></tr>
        <tr><td style="padding:7px 8px;font-size:.84rem">Product description quality</td><td style="padding:7px 8px">${allChecks.some(c => c.id === 'dropship:thin_product_description') ? '<span style="color:#d97706">Thin descriptions detected</span>' : '<span style="color:#16a34a">Adequate descriptions</span>'}</td><td style="padding:7px 8px;font-size:.8rem;color:#64748b">${allChecks.filter(c => c.id === 'dropship:thin_product_description').length > 0 ? 'Some products have <50 words of content' : ''}</td></tr>
      </tbody>
    </table>
  </div>` : ''}

  ${productResults.length > 0 ? `
  <div class="card">
    <h2>Product-Level Detail (${sampledCount} product(s))</h2>
    ${productSections}
  </div>` : ''}

  ${systemicPatterns.length > 0 ? `
  <div class="card">
    <h2>Systemic Patterns</h2>
    <table>
      <thead><tr><th>Signature</th><th style="width:60px;text-align:center">Count</th><th style="width:60px;text-align:center">%</th><th style="width:120px">Scope</th></tr></thead>
      <tbody>${patternRows}</tbody>
    </table>
  </div>` : ''}

  <div class="card">
    <h2>Manual Checklist</h2>
    <p style="font-size:.82rem;color:#64748b;margin-bottom:1rem">Items that cannot be verified by crawling. Complete before submitting a GMC appeal.</p>
    <div class="cg"><h3>MC-01 — GMC Account vs Website</h3><ul class="cl">
      <li><input type="checkbox"> Business name in GMC matches website footer exactly (Inc./LLC/Ltd. suffixes matter)</li>
      <li><input type="checkbox"> Business address in GMC matches address on website</li>
      <li><input type="checkbox"> Phone number in GMC matches phone on website contact page</li>
      <li><input type="checkbox"> Website domain in GMC matches actual store domain (www vs non-www)</li>
    </ul></div>
    <div class="cg"><h3>MC-02 — Feed vs Landing Page</h3><ul class="cl">
      <li><input type="checkbox"> Product prices in GMC feed match prices on product pages</li>
      <li><input type="checkbox"> Availability in feed matches availability on product pages</li>
      <li><input type="checkbox"> Product titles in feed match H1 on landing pages</li>
      <li><input type="checkbox"> Currency in feed matches currency on product pages</li>
    </ul></div>
    <div class="cg"><h3>MC-03 — Shipping Settings</h3><ul class="cl">
      <li><input type="checkbox"> Free shipping threshold in GMC matches website claim</li>
      <li><input type="checkbox"> Shipping countries in GMC match shipping policy</li>
      <li><input type="checkbox"> Delivery estimates in GMC match shipping policy</li>
    </ul></div>
    <div class="cg"><h3>MC-04 — Return Policy Operability</h3><ul class="cl">
      <li><input type="checkbox"> Return request process actually works</li>
      <li><input type="checkbox"> Return address is real and deliverable</li>
      <li><input type="checkbox"> Refund method in policy is available at checkout</li>
    </ul></div>
    <div class="cg"><h3>MC-05 — Reviews</h3><ul class="cl">
      <li><input type="checkbox"> Review platform is properly connected and reviews are genuine</li>
      <li><input type="checkbox"> Review count on page matches platform dashboard</li>
    </ul></div>
    <div class="cg"><h3>MC-06 — Business Legitimacy</h3><ul class="cl">
      <li><input type="checkbox"> Business is legally registered in its stated jurisdiction</li>
      <li><input type="checkbox"> All certifications and awards are current and verifiable</li>
      <li><input type="checkbox"> "As Seen On" logos are accurate with real coverage</li>
    </ul></div>
    <div class="cg"><h3>MC-07 — Checkout</h3><ul class="cl">
      <li><input type="checkbox"> Add-to-cart works for all in-stock products</li>
      <li><input type="checkbox"> Checkout completes without errors</li>
      <li><input type="checkbox"> No unexpected fees appear at checkout</li>
    </ul></div>
  </div>

  <div class="card">
    <h2>Remediation Plan</h2>
    <div class="phase p1"><strong>🔴 Phase 1 — Today: False Claims &amp; Identity</strong>Remove unverifiable claims. Fix business identity. Fix Liquid errors. Do not appeal until complete.</div>
    <div class="phase p2"><strong>🔴 Phase 2 — This Week: Policies &amp; Purchase Path</strong>Fix empty/missing policy pages. Verify add-to-cart. Add return address. Align free-shipping claims. Complete MC-01 &amp; MC-02.</div>
    <div class="phase p3"><strong>🟠 Phase 3 — This Month: Schema &amp; Data Quality</strong>Populate GTIN/MPN/brand. Update stale content. Fix broken policy links.</div>
    <div class="phase p4"><strong>🟡 Phase 4 — Ongoing: Trust &amp; Freshness</strong>Monitor feed vs page consistency. Rescan after catalog changes.</div>
    <p style="margin-top:.75rem;font-size:.82rem;color:#dc2626;font-weight:600">Never submit a GMC appeal until Phase 1 and Phase 2 are fully resolved.</p>
  </div>

  <div class="card">
    <h2>Policy verification</h2>
    <p style="font-size:.82rem;color:#64748b;margin-bottom:.75rem">Verify each finding against the current Google Merchant Center policy before remediation or appeal. This report intentionally does not embed external reference links.</p>
  </div>

  <div class="card" style="font-size:.8rem;color:#64748b">
    Theme: ${escapeHtml(themeHints?.family || 'unknown')} &nbsp;·&nbsp; Products discovered: ${escapeHtml(totalDiscovered)} &nbsp;·&nbsp; Audited: ${escapeHtml(sampledCount)} &nbsp;·&nbsp; Scan: ${escapeHtml(fetchedAt)}
  </div>

</main>
<div class="footer">Generated by Selofy Skill Hub — shopify-gmc-misrepresentation-auditor &nbsp;·&nbsp; Read-only crawl &nbsp;·&nbsp; For reference only — final authority is Google Merchant Center</div>
</body>
</html>`);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function main() {
  if (fixturePath) {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (!fixture.storeUrl || !Array.isArray(fixture.storeChecks) || !Array.isArray(fixture.productResults)) {
      throw new Error('FIXTURE_INVALID: storeUrl, storeChecks, and productResults are required.');
    }
    const html = generateHtmlReport({
      fetchedAt: fixture.fetchedAt || new Date().toISOString(),
      systemicPatterns: fixture.systemicPatterns || [],
      overallScore: fixture.overallScore || { risk: 0 },
      policies: fixture.policies || {},
      themeHints: fixture.themeHints || null,
      sampledCount: fixture.sampledCount ?? fixture.productResults.length,
      totalDiscovered: fixture.totalDiscovered ?? fixture.productResults.length,
      dropshippingSignals: fixture.dropshippingSignals || {},
      ...fixture,
    });
    const outPath = resolve(process.cwd(), outFile);
    writeFileSync(outPath, html, 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, fixture: true, reportPath: outPath }, null, 2) + '\n');
    return;
  }
  const isProductUrl = targetUrl.includes('/products/');
  let storePhaseData = null;

  // Try to read Phase A data from stdin if piped
  if (!process.stdin.isTTY) {
    try {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      storePhaseData = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {}
  }

  let storeUrl = storeUrlArg || (storePhaseData?.storeUrl) || (isProductUrl ? new URL(targetUrl).origin : targetUrl);
  if (!storeUrl.startsWith('http')) storeUrl = 'https://' + storeUrl;

  let storeChecks = storePhaseData?.checks || [];
  let policies = storePhaseData?.policies || {};
  let themeHints = storePhaseData?.themeHints || null;
  let sampledProductUrls = storePhaseData?.sampledProductUrls || [];
  let totalDiscovered = storePhaseData?.productUrls?.length || 0;

  // If no Phase A data and not a product URL, run a minimal store fetch for theme detection
  if (!storePhaseData && !isProductUrl) {
    process.stderr.write('No Phase A data provided. Run gmc-store-audit.mjs first for full store-level checks.\n');
  }

  // Determine which product URLs to audit
  let productUrlsToAudit = [];
  if (isProductUrl) {
    productUrlsToAudit = [targetUrl];
    totalDiscovered = 1;
  } else if (sampledProductUrls.length > 0) {
    productUrlsToAudit = sampledProductUrls;
  }

  // Phase B: audit each product
  const productResults = [];
  for (const url of productUrlsToAudit) {
    process.stderr.write(`Auditing: ${url}\n`);
    const res = await fetchPage(url);
    await sleep(1200);
    if (!res.ok) {
      productResults.push({ url, checks: [{ id: 'technical:product_page_unreachable', severity: 'high', confidence: 1.0, message: `Product page returned ${res.status}`, policyBasis: 'Product pages must be accessible' }], meta: {} });
      continue;
    }
    productResults.push(runProductChecks(res.text, url));
  }

  // Systemic patterns
  const systemicPatterns = detectSystemicPatterns(productResults);

  // Overall score: store checks (no multiplier) + average per-product risk × scope
  const productChecks = productResults.flatMap(pr => pr.checks);
  const storeScore = computeScore(storeChecks);
  const productRaw = computeScore(productChecks);
  const scopeMultiplier = systemicPatterns.length > 0
    ? Math.max(...systemicPatterns.map(p => p.scopeMultiplier))
    : 1.0;
  const avgProductRisk = productResults.length > 0 ? productRaw.risk / productResults.length : 0;
  const overallScore = {
    risk: Math.min(100, Math.round(storeScore.risk + avgProductRisk * scopeMultiplier)),
  };

  // Generate report
  const html = generateHtmlReport({
    storeUrl,
    fetchedAt: new Date().toISOString(),
    storeChecks,
    productResults,
    systemicPatterns,
    overallScore,
    policies,
    themeHints: storePhaseData?.themeHints || null,
    sampledCount: productResults.length,
    totalDiscovered,
    dropshippingSignals: storePhaseData?.dropshippingSignals || {},
  });

  const outPath = resolve(process.cwd(), outFile);
  writeFileSync(outPath, html, 'utf8');
  const finalAllChecks = [...storeChecks, ...productChecks];
  process.stderr.write(`\nReport written to: ${outPath}\n`);
  process.stderr.write(`Risk score: ${overallScore.risk}/100\n`);
  process.stderr.write(`Critical: ${finalAllChecks.filter(c => c.severity === 'critical').length} | High: ${finalAllChecks.filter(c => c.severity === 'high').length} | Medium: ${finalAllChecks.filter(c => c.severity === 'medium').length}\n`);
}

// Only run main() when executed directly (not when imported as a module)
const _isMain = (() => {
  try {
    const scriptPath = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1').replace(/\//g, '\\');
    return process.argv[1] === scriptPath || process.argv[1]?.replace(/\//g, '\\') === scriptPath;
  } catch { return false; }
})();
if (_isMain) {
  main().catch(err => {
    process.stderr.write(`Fatal: ${err.message}\n${err.stack}\n`);
    process.exit(1);
  });
}
