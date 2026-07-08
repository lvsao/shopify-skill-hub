#!/usr/bin/env node
/**
 * shopify-market-lang-check.mjs
 * Check language (locale) and market configuration for a Shopify store.
 * Also provides mutation helpers for market/locale setup.
 *
 * Usage:
 *   node shopify-market-lang-check.mjs check --target zh-CN --env skill-hub.env
 *   node shopify-market-lang-check.mjs setup-market ... (future)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const API_VERSION = '2026-04';
const args = process.argv.slice(2);
const command = args[0];
const flags = {};
for (let i = 1; i < args.length; i += 2) {
  if (args[i]?.startsWith('--')) flags[args[i].slice(2)] = args[i + 1] ?? true;
}

function loadEnv(envPath) {
  const candidates = envPath ? [resolve(envPath)] : [resolve('skill-hub.env'), resolve('.env')];
  let env = {};
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx < 0) continue;
      env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
    }
    break;
  }
  if (!env.SKILL_HUB_SHOPIFY_STORE_DOMAIN && env.SHOPIFY_TEST_STORE_DOMAIN)
    env.SKILL_HUB_SHOPIFY_STORE_DOMAIN = env.SHOPIFY_TEST_STORE_DOMAIN;
  if (!env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN && env.SHOPIFY_ADMIN_API_ACCESS_TOKEN)
    env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN = env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  return env;
}

function resolveAdminHost(domain) {
  if (!domain) throw new Error('SKILL_HUB_SHOPIFY_STORE_DOMAIN not set');
  const cleanDomain = String(domain).trim().toLowerCase();
  let host = cleanDomain;
  if (!host.endsWith('.myshopify.com')) {
    if (host.includes('/') || host.includes('.')) {
      throw new Error(`Invalid shop domain: "${domain}". Domain must be a store name or end with ".myshopify.com".`);
    }
    host = `${host}.myshopify.com`;
  }
  if (!/^[a-zA-Z0-9][-a-zA-Z0-9]*\.myshopify\.com$/.test(host)) {
    throw new Error(`Invalid shop domain: "${domain}". Request blocked for security.`);
  }
  return host;
}

async function gql(host, token, query) {
  const url = `https://${host}/admin/api/${API_VERSION}/graphql.json`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query }),
    });
  } catch (fetchErr) {
    throw new Error(`FETCH_FAILED for ${url}: ${fetchErr.message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => 'no body');
    throw new Error(`HTTP ${res.status} for ${url}: ${text.substring(0, 500)}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

// ── COMMAND: check ─────────────────────────────────────────────────────────

async function cmdCheck() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const targetLocale = flags.target;
  if (!token) { console.error('No admin token found'); process.exit(1); }
  if (!targetLocale) { console.error('--target locale required (e.g. zh-CN)'); process.exit(1); }

  const localesData = await gql(host, token, 'query { shopLocales { locale primary published } }');
  const marketsData = await gql(host, token, `query { markets(first: 20) { nodes { id name enabled primary status webPresence { id rootUrls { locale url } defaultLocale { locale } alternateLocales { locale } } } } }`);

  const allLocales = localesData.shopLocales;
  const primaryLocale = allLocales.find(l => l.primary);
  const targetInfo = allLocales.find(l => l.locale === targetLocale);

  const report = {
    primaryLocale: primaryLocale?.locale,
    targetLocale: targetLocale,
    targetExists: !!targetInfo,
    targetPublished: targetInfo?.published ?? false,
    actionNeeded: !targetInfo ? 'ENABLE_AND_PUBLISH' : !targetInfo.published ? 'PUBLISH' : 'NONE',
    localePresenceInMarkets: [],
    marketSummary: []
  };

  for (const m of marketsData.markets.nodes) {
    const entry = {
      id: m.id,
      name: m.name,
      enabled: m.enabled,
      status: m.status,
      primary: m.primary,
      hasWebPresence: !!m.webPresence,
      webPresenceId: m.webPresence?.id ?? null,
      isDefaultLocale: m.webPresence?.defaultLocale?.locale === targetLocale ?? false,
      isAlternateLocale: m.webPresence?.alternateLocales?.some(l => l.locale === targetLocale) ?? false,
      currentAlternateLocales: m.webPresence?.alternateLocales?.map(l => l.locale) ?? [],
      rootUrls: m.webPresence?.rootUrls ?? []
    };
    report.localePresenceInMarkets.push(entry);

    const status = entry.isDefaultLocale ? 'DEFAULT' : entry.isAlternateLocale ? 'ALTERNATE' : 'NOT_PRESENT';
    report.marketSummary.push(`${m.name}: ${status}`);
  }

  const marketsWithLocale = report.localePresenceInMarkets.filter(m => m.isDefaultLocale || m.isAlternateLocale);

  // Build human-readable output
  const lines = [];
  lines.push(`Locale Check Report for: ${targetLocale}`);
  lines.push(`Store primary locale: ${primaryLocale?.locale}`);
  lines.push(`Target locale status: ${targetInfo ? (targetInfo.published ? '✅ Published' : '🟡 Exists but not published') : '❌ Not enabled'}`);
  lines.push('');
  lines.push('Market Presence:');
  for (const m of report.localePresenceInMarkets) {
    if (m.isDefaultLocale) {
      lines.push(`  ✅ ${m.name}: ${targetLocale} is DEFAULT locale`);
    } else if (m.isAlternateLocale) {
      lines.push(`  ✅ ${m.name}: ${targetLocale} is ALTERNATE locale`);
    } else if (m.hasWebPresence) {
      lines.push(`  🟢 ${m.name}: ${targetLocale} NOT present (alternates: ${m.currentAlternateLocales.join(', ') || 'none'})`);
    } else {
      lines.push(`  ⚪ ${m.name}: no web presence configured`);
    }
  }
  lines.push('');
  lines.push('Recommended next steps:');
  if (!targetInfo) {
    lines.push(`  1. Enable locale: shopLocaleEnable(locale: "${targetLocale}")`);
    lines.push(`  2. Publish locale: shopLocaleUpdate(locale: "${targetLocale}", published: true)`);
  } else if (!targetInfo.published) {
    lines.push(`  1. Publish locale: shopLocaleUpdate(locale: "${targetLocale}", published: true)`);
  }
  if (marketsWithLocale.length === 0) {
    lines.push(`  3. Create a market with ${targetLocale} as the default locale and add country regions`);
    lines.push(`  4. Create web presence for the market with subfolderSuffix`);
  } else {
    const missingMarkets = report.localePresenceInMarkets.filter(m => m.hasWebPresence && !m.isDefaultLocale && !m.isAlternateLocale);
    if (missingMarkets.length > 0) {
      lines.push(`  3. Consider adding ${targetLocale} to alternate locales in: ${missingMarkets.map(m => m.name).join(', ')}`);
    }
  }
  lines.push('For detailed tutorial: https://www.selofy.com/tutorials/shopify/shopify-international-market-translation');

  console.log(lines.join('\n'));
  // Also output JSON for machine consumption
  console.log('\n---JSON_START---');
  console.log(JSON.stringify(report, null, 2));
  console.log('---JSON_END---');
}

// ── COMMAND: validate-setup ─────────────────────────────────────────────────

async function cmdValidateSetup() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const targetLocale = flags.target;
  if (!token || !targetLocale) { console.error('--target and --env required'); process.exit(1); }

  const localesData = await gql(host, token, 'query { shopLocales { locale primary published } }');
  const marketsData = await gql(host, token, `query { markets(first: 20) { nodes { id name enabled primary status webPresence { id rootUrls { locale url } defaultLocale { locale } alternateLocales { locale } } } } }`);

  const targetInfo = localesData.shopLocales.find(l => l.locale === targetLocale);
  const marketsWithLocale = marketsData.markets.nodes.filter(m =>
    m.webPresence && (
      m.webPresence.defaultLocale?.locale === targetLocale ||
      m.webPresence.alternateLocales?.some(l => l.locale === targetLocale)
    )
  );

  const localeOk = targetInfo && targetInfo.published;
  const marketOk = marketsWithLocale.length > 0;

  const result = {
    status: localeOk && marketOk ? 'OK' : 'WARN',
    localeConfigured: localeOk,
    localeAction: !targetInfo ? 'ENABLE' : !targetInfo.published ? 'PUBLISH' : 'OK',
    marketsConfigured: marketOk,
    markets: marketsData.markets.nodes.map(m => ({
      name: m.name,
      hasLocale: marketsWithLocale.some(w => w.id === m.id),
      defaultLocale: m.webPresence?.defaultLocale?.locale,
      alternateLocales: m.webPresence?.alternateLocales?.map(l => l.locale) ?? []
    }))
  };

  if (!localeOk) {
    console.error(`⚠ WARN: Locale ${targetLocale} is not fully configured (enabled=${!!targetInfo}, published=${targetInfo?.published})`);
  }
  if (!marketOk) {
    console.error(`⚠ WARN: Locale ${targetLocale} is not present in any market web presence`);
  }
  if (localeOk && marketOk) {
    console.log(`✅ Locale ${targetLocale} is properly configured.`);
    console.log(`   Present in: ${marketsWithLocale.map(m => m.name).join(', ')}`);
  }

  console.log('\n---JSON_START---');
  console.log(JSON.stringify(result, null, 2));
  console.log('---JSON_END---');
}

const commands = {
  'check': cmdCheck,
  'validate-setup': cmdValidateSetup,
};

if (!command || !commands[command]) {
  console.log(`Usage:
  shopify-market-lang-check.mjs check --target <locale> --env skill-hub.env
  shopify-market-lang-check.mjs validate-setup --target <locale> --env skill-hub.env

Commands:
  check            Check locale and market configuration for a target language
  validate-setup   Quick validation: is locale enabled+published + present in markets?
`);
  process.exit(command ? 1 : 0);
}

commands[command]().catch(e => { console.error(e.message); process.exit(1); });
