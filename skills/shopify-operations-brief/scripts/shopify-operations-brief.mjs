#!/usr/bin/env node
// Main CLI entry point for shopify-operations-brief.
import fs from 'node:fs';
import path from 'node:path';
import { createShopifyClient, loadEnvFile } from './lib/auth.mjs';
import { fetchAllDiagnosticData, fetchShopMetadata } from './lib/data-fetcher.mjs';
import { processStoreDiagnostics } from './lib/analytics-engine.mjs';
import { renderDashboardHtml } from './lib/html-renderer.mjs';
import { getLocaleDict } from './lib/i18n.mjs';
import { parseDiagnosticPeriod } from './lib/time-parser.mjs';

const COMMANDS = new Set(['init-env', 'connection-check', 'diagnose', 'analyze', 'report']);

function printHelp() {
  console.log(`
Shopify Operations Brief

Usage:
  node shopify-operations-brief.mjs <command> [options]

Commands:
  init-env               Create a private connection template without overwriting a file.
  connection-check       Verify the selected connection method and Admin API access.
  diagnose               Create a read-only store performance report in HTML.

Options:
  --env <file>           Private environment file (default: ./skill-hub.env).
  --store <domain>       Explicit HTTPS <store>.myshopify.com override.
  --access-method <id>   shopify_cli_oauth, dev_dashboard_client_credentials, or admin_api_access_token.
  --api-version <id>     Stable Shopify Admin API version (default: 2026-07).
  --period <string>      last-7-days (default), yesterday, last-week, last-month, or YYYY-MM-DD..YYYY-MM-DD.
  --lang <lang>          zh-CN (default) or en.
  --output <file>        HTML path inside the working directory.
  --force                Replace an existing --output file.
  --json                 Print structured JSON only; does not create an HTML file.
  --help                 Show this help.
`);
}

function failUsage(message) {
  console.error(`[Usage Error] ${message}`);
  printHelp();
  process.exitCode = 2;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    return { help: true };
  }

  let command = 'diagnose';
  let index = 0;
  if (args[0] && !args[0].startsWith('--')) {
    command = args[0];
    index = 1;
  }
  if (!COMMANDS.has(command)) return { error: `Unknown command: ${command}` };

  const options = {
    command,
    envPath: null,
    store: null,
    accessMethod: null,
    apiVersion: null,
    period: 'last-7-days',
    lang: 'zh-CN',
    output: null,
    force: false,
    json: false,
  };
  const flagsWithValue = new Map([
    ['--env', 'envPath'],
    ['--store', 'store'],
    ['--access-method', 'accessMethod'],
    ['--api-version', 'apiVersion'],
    ['--period', 'period'],
    ['--lang', 'lang'],
    ['--output', 'output'],
  ]);

  for (; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force') {
      options.force = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (flagsWithValue.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) return { error: `Missing value for ${arg}` };
      options[flagsWithValue.get(arg)] = value;
      index += 1;
    } else {
      return { error: `Unknown option: ${arg}` };
    }
  }

  if (options.json && options.output) return { error: '--json and --output cannot be used together.' };
  if (options.force && !options.output) return { error: '--force requires --output.' };
  return options;
}

function outputPathFor(options, periods) {
  const workingDirectory = path.resolve(process.cwd());
  const defaultPath = path.join('reports', `shopify-operations-brief-${periods.current.endDate.replace(/-/g, '')}.html`);
  const target = path.resolve(workingDirectory, options.output || defaultPath);
  if (target !== workingDirectory && !target.startsWith(`${workingDirectory}${path.sep}`)) {
    throw new Error('UNSAFE_OUTPUT_PATH: Output must remain inside the current working directory.');
  }
  if (path.extname(target).toLowerCase() !== '.html') {
    throw new Error('INVALID_OUTPUT_PATH: The report output must use a .html extension.');
  }
  if (fs.existsSync(target) && !options.force) {
    throw new Error('OUTPUT_EXISTS: Choose a new --output path or pass --force to replace it.');
  }
  return target;
}

function writeTemplate(target) {
  if (fs.existsSync(target)) {
    throw new Error(`OUTPUT_EXISTS: Refusing to replace ${target}.`);
  }
  const template = `# Private Shopify connection for shopify-operations-brief
# Choose exactly one access method. The default opens Shopify CLI browser OAuth.
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_ACCESS_METHOD=shopify_cli_oauth
SKILL_HUB_SHOPIFY_SCOPES=read_orders,read_products,read_inventory

# For long-running Dev Dashboard access, replace the access method above and add:
# SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_client_credentials
# SKILL_HUB_SHOPIFY_CLIENT_ID=your_client_id
# SKILL_HUB_SHOPIFY_CLIENT_SECRET=your_client_secret

# For an explicitly selected local Admin token, add:
# SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_api_access_token
# SKILL_HUB_SHOPIFY_ACCESS_TOKEN=your_admin_access_token
`;
  fs.writeFileSync(target, template, 'utf8');
  console.log(`[Success] Created private connection template: ${target}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.error) {
    failUsage(options.error);
    return;
  }

  if (options.command === 'init-env') {
    writeTemplate(path.resolve(options.envPath || 'skill-hub.env'));
    return;
  }

  const envConfig = loadEnvFile(options.envPath);
  if (options.store) envConfig.SKILL_HUB_SHOPIFY_STORE_DOMAIN = options.store;
  if (options.accessMethod) envConfig.SKILL_HUB_SHOPIFY_ACCESS_METHOD = options.accessMethod;
  if (options.apiVersion) envConfig.SKILL_HUB_SHOPIFY_API_VERSION = options.apiVersion;
  const client = await createShopifyClient(envConfig);

  if (options.command === 'connection-check') {
    const shop = await fetchShopMetadata(client);
    console.log(`[Success] Connected to ${shop.myshopifyDomain} using ${client.accessMethod}.`);
    console.log(`  API version: ${client.apiVersion} | Currency: ${shop.currencyCode} | Timezone: ${shop.ianaTimezone || 'UTC'}`);
    return;
  }

  const shopMeta = await fetchShopMetadata(client);
  const periods = parseDiagnosticPeriod(options.period, shopMeta.ianaTimezone || 'UTC');
  const rawData = await fetchAllDiagnosticData(client, periods, shopMeta);
  const processed = processStoreDiagnostics(rawData, periods, options.lang, null, periods.timezone);

  if (options.json) {
    console.log(JSON.stringify(processed, null, 2));
    return;
  }

  const reportPath = outputPathFor(options, periods);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, renderDashboardHtml(processed, options.lang), 'utf8');

  const dict = getLocaleDict(options.lang);
  const isEn = options.lang.toLowerCase().startsWith('en');
  const primaryMarket = processed.current.geo[0]?.country || dict.noOrderData;
  const primaryMarketShare = processed.current.ordersCount
    ? ((processed.current.geo[0]?.count || 0) / processed.current.ordersCount * 100).toFixed(0)
    : '—';
  console.log(`\n📊 ${processed.shopName} · ${isEn ? periods.current.labelEn : periods.current.labelZh}`);
  console.log(`📅 ${periods.current.displayRange} (${isEn ? 'vs.' : '对比'} ${periods.previous.displayRange})`);
  console.log(`💡 ${processed.executiveSummary}`);
  console.log(`${isEn ? 'Sales' : '销售额'}: ${processed.currencySymbol}${processed.current.gmv.toFixed(2)} | ${isEn ? 'Average order value' : '每笔订单平均金额'}: ${processed.currencySymbol}${processed.current.aov.toFixed(2)} | ${isEn ? 'Average items per order' : '平均每单商品数'}: ${processed.current.upt.toFixed(2)}`);
  console.log(`${dict.globalTitle}: ${processed.current.geo.length} ${dict.countriesCount}; ${primaryMarket} ${primaryMarketShare}%`);
  console.log(`✅ ${isEn ? 'HTML report created' : 'HTML 报告已生成'}: ${reportPath}`);
}

main().catch((error) => {
  console.error(`[Fatal Error] ${error.message}`);
  process.exitCode = 1;
});
