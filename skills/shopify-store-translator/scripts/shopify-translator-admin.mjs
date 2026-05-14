#!/usr/bin/env node
/**
 * shopify-translator-admin.mjs
 * Shopify Store Translator — helper script
 * API version: 2026-04
 *
 * Commands:
 *   init-env              Create skill-hub.env with placeholders
 *   connection-check      Verify Admin API access
 *   check-locales         Report locale status for a target language
 *   enable-locale         Enable and publish a locale
 *   check-markets         Report which markets have the target locale
 *   add-locale-to-market  Add locale to a market's webPresence
 *   fetch                 Fetch translatable content for a resource type
 *   write                 Write translations from a CSV file to Shopify
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const API_VERSION = '2026-04';

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const flags = {};
for (let i = 1; i < args.length; i += 2) {
  if (args[i]?.startsWith('--')) flags[args[i].slice(2)] = args[i + 1] ?? true;
}

// ─── Env loading ──────────────────────────────────────────────────────────────

function loadEnv(envPath) {
  // Try skill-hub.env first, then .env as fallback
  const candidates = envPath
    ? [resolve(envPath)]
    : [resolve('skill-hub.env'), resolve('.env')];

  let env = {};
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    break; // use first found file
  }

  // Compatibility: map legacy .env variable names to skill-hub.env names
  if (!env.SKILL_HUB_SHOPIFY_STORE_DOMAIN && env.SHOPIFY_TEST_STORE_DOMAIN)
    env.SKILL_HUB_SHOPIFY_STORE_DOMAIN = env.SHOPIFY_TEST_STORE_DOMAIN;
  if (!env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN && env.SHOPIFY_ADMIN_API_ACCESS_TOKEN)
    env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN = env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  return env;
}

function resolveAdminHost(domain) {
  if (!domain) throw new Error('SKILL_HUB_SHOPIFY_STORE_DOMAIN is not set');
  return domain.endsWith('.myshopify.com') ? domain : `${domain}.myshopify.com`;
}

// ─── GraphQL client ───────────────────────────────────────────────────────────

async function gql(host, token, query, variables = {}) {
  const url = `https://${host}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

// ─── Rate limit helper ────────────────────────────────────────────────────────

async function gqlWithThrottle(host, token, query, variables = {}) {
  const url = `https://${host}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  const available = json.extensions?.cost?.throttleStatus?.currentlyAvailable ?? 2000;
  if (available < 200) await new Promise(r => setTimeout(r, 1000));
  return json.data;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { values.push(cur); cur = ''; continue; }
      cur += ch;
    }
    values.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? '').trim()]));
  });
}

function escapeCSV(val) {
  if (val == null) return '';
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdInitEnv() {
  const method = flags.method || 'admin_custom_app';
  const envPath = flags.env || 'skill-hub.env';
  if (existsSync(envPath)) {
    console.log(`${envPath} already exists. Edit it directly.`);
    return;
  }
  const content = method === 'dev_dashboard_app'
    ? `# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id
`
    : `# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
`;
  writeFileSync(envPath, content);
  console.log(`Created ${envPath}. Fill in the required values.`);
}

async function cmdConnectionCheck() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (!token) { console.error('CLI_AUTH_REQUIRED: No admin token found.'); process.exit(1); }
  try {
    const data = await gql(host, token, 'query { shop { name id } }');
    console.log(JSON.stringify({ status: 'OK', shop: data.shop.name, id: data.shop.id }));
  } catch (e) {
    console.error('CONNECTION_FAILED:', e.message);
    process.exit(1);
  }
}

async function cmdCheckLocales() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const target = flags.target;
  if (!target) { console.error('--target locale is required'); process.exit(1); }

  const data = await gql(host, token, 'query { shopLocales { locale primary published } }');
  const locales = data.shopLocales;
  const primary = locales.find(l => l.primary);
  const found = locales.find(l => l.locale === target);

  const result = {
    primaryLocale: primary?.locale,
    targetLocale: target,
    exists: !!found,
    published: found?.published ?? false,
    action: !found ? 'ENABLE_AND_PUBLISH' : !found.published ? 'PUBLISH' : 'NONE',
    allLocales: locales,
  };
  console.log(JSON.stringify(result, null, 2));
}

async function cmdEnableLocale() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const locale = flags.locale;
  if (!locale) { console.error('--locale is required'); process.exit(1); }

  // Enable
  const enableData = await gql(host, token,
    `mutation { shopLocaleEnable(locale: "${locale}") { shopLocale { locale published } userErrors { field message } } }`
  );
  const enableErrors = enableData.shopLocaleEnable.userErrors;
  if (enableErrors.length) { console.error('Enable errors:', enableErrors); process.exit(1); }

  // Publish
  const publishData = await gql(host, token,
    `mutation { shopLocaleUpdate(locale: "${locale}", shopLocale: { published: true }) { shopLocale { locale published } userErrors { field message } } }`
  );
  const publishErrors = publishData.shopLocaleUpdate.userErrors;
  if (publishErrors.length) { console.error('Publish errors:', publishErrors); process.exit(1); }

  console.log(JSON.stringify({ status: 'OK', locale, published: true }));
}

async function cmdCheckMarkets() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const locale = flags.locale;
  if (!locale) { console.error('--locale is required'); process.exit(1); }

  const data = await gql(host, token, `query {
    markets(first: 20) {
      nodes {
        id name enabled primary
        webPresence {
          id
          rootUrls { locale url }
          defaultLocale { locale published }
          alternateLocales { locale published }
        }
      }
    }
  }`);

  const markets = data.markets.nodes.map(m => ({
    id: m.id,
    name: m.name,
    enabled: m.enabled,
    primary: m.primary,
    webPresenceId: m.webPresence?.id ?? null,
    hasLocale: m.webPresence
      ? m.webPresence.alternateLocales.some(l => l.locale === locale) ||
        m.webPresence.defaultLocale?.locale === locale
      : false,
    currentAlternateLocales: m.webPresence?.alternateLocales.map(l => l.locale) ?? [],
    url: m.webPresence?.rootUrls.find(u => u.locale === locale)?.url ?? null,
  }));

  console.log(JSON.stringify({ targetLocale: locale, markets }, null, 2));
}

async function cmdAddLocaleToMarket() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const webPresenceId = flags['market-web-presence-id'];
  const locale = flags.locale;
  if (!webPresenceId || !locale) {
    console.error('--market-web-presence-id and --locale are required');
    process.exit(1);
  }

  // Read current alternateLocales first
  const checkData = await gql(host, token, `query {
    markets(first: 20) {
      nodes {
        webPresence { id alternateLocales { locale } }
      }
    }
  }`);
  const wp = checkData.markets.nodes
    .map(m => m.webPresence)
    .find(w => w?.id === webPresenceId);
  if (!wp) { console.error('webPresence not found:', webPresenceId); process.exit(1); }

  const existing = wp.alternateLocales.map(l => l.locale);
  if (existing.includes(locale)) {
    console.log(JSON.stringify({ status: 'ALREADY_EXISTS', locale, webPresenceId }));
    return;
  }

  const newLocales = [...existing, locale];
  const localesArg = JSON.stringify(newLocales);

  const data = await gql(host, token, `mutation {
    marketWebPresenceUpdate(
      webPresenceId: "${webPresenceId}"
      webPresence: { alternateLocales: ${localesArg} }
    ) {
      market { webPresence { alternateLocales { locale } } }
      userErrors { field message }
    }
  }`);

  const errors = data.marketWebPresenceUpdate.userErrors;
  if (errors.length) { console.error('Errors:', errors); process.exit(1); }

  console.log(JSON.stringify({
    status: 'OK',
    locale,
    webPresenceId,
    alternateLocales: data.marketWebPresenceUpdate.market.webPresence.alternateLocales.map(l => l.locale),
  }));
}

async function cmdFetch() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const resourceType = flags['resource-type'] || 'PRODUCT';
  const locale = flags.locale;
  const outputFile = flags.output;
  if (!locale) { console.error('--locale is required'); process.exit(1); }

  const results = [];
  let cursor = null;
  let hasNextPage = true;

  // LocalizableContentType → translate decision
  // SKIP: URI, URL, LINK, LIST_URL, LIST_LINK, FILE_REFERENCE, LIST_FILE_REFERENCE, JSON, JSON_STRING
  // TRANSLATE (plain): SINGLE_LINE_TEXT_FIELD, MULTI_LINE_TEXT_FIELD, STRING, INLINE_RICH_TEXT, RICH_TEXT_FIELD, LIST_SINGLE_LINE_TEXT_FIELD, LIST_MULTI_LINE_TEXT_FIELD
  // TRANSLATE (html): HTML
  const SKIP_TYPES = new Set(['URI','URL','LINK','LIST_URL','LIST_LINK','FILE_REFERENCE','LIST_FILE_REFERENCE','JSON','JSON_STRING']);

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const data = await gqlWithThrottle(host, token, `query {
      translatableResources(first: 50, resourceType: ${resourceType}${afterClause}) {
        nodes {
          resourceId
          translatableContent {
            key
            value
            digest
            locale
            type
          }
          translations(locale: "${locale}") { key value outdated }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`);

    const { nodes, pageInfo } = data.translatableResources;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;

    for (const node of nodes) {
      const translationMap = {};
      for (const t of node.translations) translationMap[t.key] = t;

      const fields = node.translatableContent
        .filter(c => c.key !== 'handle') // NEVER translate handles
        .filter(c => !SKIP_TYPES.has(c.type)) // skip non-translatable types per Shopify API
        .map(c => {
          const existing = translationMap[c.key];
          let status = 'NEW';
          if (existing) status = existing.outdated ? 'OUTDATED' : 'CURRENT';
          return { key: c.key, value: c.value, digest: c.digest, type: c.type, status, existingTranslation: existing?.value ?? null };
        });

      results.push({ resourceId: node.resourceId, resourceType, fields });
    }
  }

  const output = JSON.stringify({ locale, resourceType, resources: results }, null, 2);
  if (outputFile) {
    const dir = dirname(resolve(outputFile));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outputFile, output);
    console.log(`Fetched ${results.length} resources → ${outputFile}`);
  } else {
    console.log(output);
  }
}

async function cmdWrite() {
  const env = loadEnv(flags.env);
  const host = resolveAdminHost(env.SKILL_HUB_SHOPIFY_STORE_DOMAIN);
  const token = env.SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const inputFile = flags.input;
  const locale = flags.locale;
  if (!inputFile || !locale) { console.error('--input and --locale are required'); process.exit(1); }

  const csv = readFileSync(inputFile, 'utf8');
  const rows = parseCSV(csv).filter(r => r.status === 'NEW' || r.status === 'OUTDATED' || r.status === 'UPDATE');

  // Group by resource_id (support both 'resource_id' and legacy 'product_id' column names)
  const byResource = {};
  for (const row of rows) {
    const id = row.resource_id || row.product_id;
    if (!id) continue;
    // Support both 'translation_{locale}' column naming conventions
    const translationKey = `translation_${locale}`;
    const value = row[translationKey];
    if (!value || !row.digest) continue;
    // Support both 'field_key' column names
    const key = row.field_key;
    if (!key) continue;
    if (!byResource[id]) byResource[id] = [];
    byResource[id].push({ key, value, digest: row.digest });
  }

  const resourceIds = Object.keys(byResource);
  let successCount = 0, errorCount = 0;

  // Batch 5 resources per request using GraphQL aliases
  for (let i = 0; i < resourceIds.length; i += 5) {
    const batch = resourceIds.slice(i, i + 5);
    const aliasParts = batch.map((id, idx) => {
      const translations = byResource[id].map(t =>
        `{locale: "${locale}", key: "${t.key}", value: ${JSON.stringify(t.value)}, translatableContentDigest: "${t.digest}"}`
      ).join(', ');
      return `r${idx}: translationsRegister(resourceId: "${id}", translations: [${translations}]) { translations { key value } userErrors { field message } }`;
    });

    const mutation = `mutation { ${aliasParts.join('\n')} }`;
    try {
      const data = await gqlWithThrottle(host, token, mutation);
      for (const key of Object.keys(data)) {
        const result = data[key];
        if (result.userErrors?.length) {
          console.error(`Error for alias ${key}:`, result.userErrors);
          errorCount++;
        } else {
          successCount += result.translations?.length ?? 0;
        }
      }
    } catch (e) {
      console.error(`Batch ${i}-${i + 5} failed:`, e.message);
      errorCount += batch.length;
    }
  }

  console.log(JSON.stringify({ status: 'DONE', successCount, errorCount, locale }));
}

async function cmdTranslateCSV() {
  const inputFile = flags.input;
  const outputFile = flags.output;
  const locale = flags.locale;
  if (!inputFile || !outputFile || !locale) {
    console.error('--input, --output, and --locale are required');
    process.exit(1);
  }

  const content = readFileSync(inputFile, 'utf8');
  const rows = parseCSV(content);
  const headers = rows[0];

  // Column indices
  const COL = { type:0, id:1, field:2, locale:3, market:4, status:5, default:6, translated:7 };

  function shouldSkipRow(r) {
    const type = r[COL.type], field = r[COL.field], val = r[COL.default] || '';
    if ((r[COL.translated] || '').trim()) return true; // already translated
    if (!val.trim()) return true;
    if (field === 'handle') return true;
    if (type === 'ONLINE_STORE_THEME' || type === 'PACKING_SLIP_TEMPLATE') return true;
    if (type === 'METAOBJECT' && field === 'data') return true;
    const v = val.trim();
    if (v.startsWith('{%') || v.startsWith('{{')) return true;
    if (type === 'PRODUCT_OPTION_VALUE' && /^\$?\d+(\.\d+)?$/.test(v)) return true;
    if (field === 'description' && /^[a-z_]+$/.test(v)) return true;
    return false;
  }

  let needsTranslation = 0, skipped = 0, alreadyDone = 0;
  const toTranslate = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    while (r.length < 8) r.push('');
    if ((r[COL.translated] || '').trim()) { alreadyDone++; continue; }
    if (shouldSkipRow(r)) { skipped++; continue; }
    needsTranslation++;
    toTranslate.push({ rowIdx: i, type: r[COL.type], field: r[COL.field], value: r[COL.default] });
  }

  console.log(JSON.stringify({
    status: 'READY',
    locale,
    totalRows: rows.length - 1,
    alreadyDone,
    skipped,
    needsTranslation,
    note: `Agent should translate the ${needsTranslation} rows listed in toTranslate and call write-csv-translations to apply them.`,
    toTranslate: toTranslate.slice(0, 50), // first 50 for agent context
  }, null, 2));
}

async function cmdWriteCSVTranslations() {
  // Reads original CSV + a JSON patch file, writes translated CSV
  const inputFile = flags.input;
  const patchFile = flags.patch; // JSON: [{rowIdx, translation}]
  const outputFile = flags.output;
  if (!inputFile || !patchFile || !outputFile) {
    console.error('--input, --patch, and --output are required');
    process.exit(1);
  }

  const content = readFileSync(inputFile, 'utf8');
  const rows = parseCSV(content);
  const patches = JSON.parse(readFileSync(patchFile, 'utf8'));

  for (const { rowIdx, translation } of patches) {
    if (rows[rowIdx]) {
      while (rows[rowIdx].length < 8) rows[rowIdx].push('');
      rows[rowIdx][7] = translation;
    }
  }

  const csvLines = rows.map(row => row.map(v => {
    const s = String(v == null ? '' : v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(','));

  writeFileSync(outputFile, csvLines.join('\n'), 'utf8');
  console.log(JSON.stringify({ status: 'OK', outputFile, patchedRows: patches.length }));
}

const commands = {
  'init-env': cmdInitEnv,
  'connection-check': cmdConnectionCheck,
  'check-locales': cmdCheckLocales,
  'enable-locale': cmdEnableLocale,
  'check-markets': cmdCheckMarkets,
  'add-locale-to-market': cmdAddLocaleToMarket,
  'fetch': cmdFetch,
  'write': cmdWrite,
  'translate-csv': cmdTranslateCSV,
  'write-csv-translations': cmdWriteCSVTranslations,
};

if (!command || !commands[command]) {
  console.log(`Usage: shopify-translator-admin.mjs <command> [options]

Commands:
  init-env              --method admin_custom_app|dev_dashboard_app --env skill-hub.env
  connection-check      --env skill-hub.env
  check-locales         --env skill-hub.env --target <locale>
  enable-locale         --env skill-hub.env --locale <locale>
  check-markets         --env skill-hub.env --locale <locale>
  add-locale-to-market  --env skill-hub.env --market-web-presence-id <id> --locale <locale>
  fetch                 --env skill-hub.env --resource-type <TYPE> --locale <locale> [--output <file>]
  write                 --env skill-hub.env --input <csv> --locale <locale>
`);
  process.exit(command ? 1 : 0);
}

commands[command]().catch(e => { console.error(e.message); process.exit(1); });
