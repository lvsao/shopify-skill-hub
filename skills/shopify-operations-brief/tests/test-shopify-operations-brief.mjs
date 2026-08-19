import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateShopDomain } from '../scripts/lib/auth.mjs';
import { fetchAllDiagnosticData } from '../scripts/lib/data-fetcher.mjs';
import { analyzeInventoryHealth, processStoreDiagnostics } from '../scripts/lib/analytics-engine.mjs';
import { escapeHtml, renderDashboardHtml } from '../scripts/lib/html-renderer.mjs';
import { parseDiagnosticPeriod } from '../scripts/lib/time-parser.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(testDirectory, '../scripts/shopify-operations-brief.mjs');

function makeOrder(id) {
  return {
    id,
    name: `#${id}`,
    createdAt: '2026-08-12T10:00:00.000Z',
    displayFulfillmentStatus: 'FULFILLED',
    totalPriceSet: { shopMoney: { amount: '20.00', currencyCode: 'USD' } },
    subtotalPriceSet: { shopMoney: { amount: '20.00' } },
    totalDiscountsSet: { shopMoney: { amount: '0.00' } },
    totalRefundedSet: { shopMoney: { amount: '0.00' } },
    paymentGatewayNames: [],
    shippingAddress: { country: 'United States', countryCodeV2: 'US' },
    customer: { numberOfOrders: 1 },
    customerJourneySummary: null,
    discountApplications: { edges: [] },
    lineItems: {
      pageInfo: { hasNextPage: false },
      edges: [{ node: { title: 'Widget', quantity: 1, originalUnitPriceSet: { shopMoney: { amount: '20.00' } } } }],
    },
    fulfillments: [{ createdAt: '2026-08-12T12:00:00.000Z', status: 'SUCCESS' }],
    refunds: [],
  };
}

function paginatedClient() {
  return {
    async query(query, variables = {}) {
      if (query.includes('GetInventoryHealth')) {
        if (!variables.cursor) {
          return {
            products: {
              pageInfo: { hasNextPage: true, endCursor: 'inventory-2' },
              edges: [{ node: { id: 'p1', title: 'Widget', productType: '', variants: { pageInfo: { hasNextPage: false }, edges: [] } } }],
            },
          };
        }
        return { products: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] } };
      }
      if (query.includes('GetPeriodOrders')) {
        const isCurrent = variables.query.includes('current');
        if (isCurrent && !variables.cursor) {
          return { orders: { pageInfo: { hasNextPage: true, endCursor: 'orders-2' }, edges: [{ node: makeOrder('1') }] } };
        }
        if (isCurrent) {
          return { orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [{ node: makeOrder('2') }] } };
        }
        return { orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] } };
      }
      if (query.includes('GetAbandonedCheckouts')) {
        return { abandonedCheckouts: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] } };
      }
      throw new Error('Unexpected query');
    },
  };
}

await assert.rejects(validateShopDomain('https://example.invalid'), /INVALID_STORE_DOMAIN/);
await assert.rejects(validateShopDomain('https://safe.myshopify.com@evil.example'), /INVALID_STORE_DOMAIN/);

const periods = {
  current: { filter: 'current' },
  previous: { filter: 'previous' },
};
const fetched = await fetchAllDiagnosticData(paginatedClient(), periods, { name: 'Test', currencyCode: 'USD' });
assert.equal(fetched.current.orders.length, 2, 'orders must continue through the cursor');
assert.equal(fetched.products.length, 1, 'products must continue through the cursor');

assert.deepEqual(
  analyzeInventoryHealth([
    {
      title: 'Top product',
      productType: '',
      variants: { edges: [
        { node: { title: 'Tracked', sku: 'TOP-1', inventoryQuantity: 3, inventoryItem: { tracked: true } } },
        { node: { title: 'Untracked', sku: 'TOP-2', inventoryQuantity: 0, inventoryItem: { tracked: false } } },
      ] },
    },
    {
      title: 'Gift Card',
      productType: 'Gift Card',
      variants: { edges: [{ node: { title: 'Gift', sku: 'GIFT', inventoryQuantity: 0, inventoryItem: { tracked: true } } }] },
    },
  ], [{ title: 'Top product' }, { title: 'Gift Card' }]),
  [{ productTitle: 'Top product', variantTitle: 'Tracked', sku: 'TOP-1', qty: 3, isTopSeller: true }],
);

assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
const html = renderDashboardHtml({
  shopName: '<script>alert(1)</script>',
  currencySymbol: '$',
  periods: { current: { labelEn: 'Test', labelZh: '测试', displayRange: '2026.08.01 - 2026.08.07' }, previous: { displayRange: '2026.07.25 - 2026.07.31' } },
  current: {
    gmv: 0, discounts: 0, discountPenetration: 0, aov: 0, upt: 0, singleItemRatio: 0,
    avgLeadTimeHours: 0, over48h: 0, delayedUnfulfilled: [], ordersCount: 0,
    geo: [{ country: '<svg onload=alert(1)>', count: 0 }], basketSize: { 1: 0, 2: 0, '3+': 0 },
    coOccurrence: [{ pair: '<img src=x onerror=alert(1)>', count: 1 }],
    promoCodes: [{ code: '<script>alert(1)</script>', count: 1 }], discountedAov: 0,
    discountedOrdersCount: 0, fullPriceAov: 0, fullPriceOrdersCount: 0,
    under24h: 0, standard24to48h: 0, gateways: [{ gateway: '<b>gateway</b>', count: 0 }],
  },
  previous: {}, deltas: { gmv: '0.0', aov: '0.0', orders: '0.0' },
  inventoryRisks: [{ productTitle: '<script>alert(1)</script>', variantTitle: '<b>variant</b>', sku: '<i>sku</i>', qty: 1 }],
  todos: [{ priority: 'p1', title: '<img src=x onerror=alert(1)>', reason: '<svg onload=alert(1)>', action: '<script>alert(1)</script>' }],
  executiveSummary: '<script>alert(1)</script>',
}, 'en');
assert.ok(!html.includes('<script>alert(1)</script>'), 'untrusted script markup must never reach the report');
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));

const parsed = parseDiagnosticPeriod('2026-08-01..2026-08-07', 'America/Los_Angeles', '2026-08-19T00:30:00.000Z');
assert.equal(parsed.timezone, 'America/Los_Angeles');
assert.match(parsed.current.filter, /2026-08-01T07:00:00.000Z/);
assert.throws(() => parseDiagnosticPeriod('2026-99-01..2026-99-02'), /INVALID_PERIOD/);

const emptyBrief = processStoreDiagnostics({
  shopMeta: { name: 'Empty', currencyCode: 'USD' },
  products: [], current: { orders: [], abandoned: [] }, previous: { orders: [], abandoned: [] },
}, periods, 'en', '2026-02-01T12:00:00.000Z');
assert.ok(!emptyBrief.todos.some((todo) => todo.priority === 'p0'), 'empty data must not create P0 alerts');
assert.match(emptyBrief.executiveSummary, /No orders were found/, 'empty data must produce an explicit no-orders summary');

const unknownCommand = spawnSync(process.execPath, [scriptPath, 'nonsense'], { encoding: 'utf8' });
assert.equal(unknownCommand.status, 2, 'unknown commands must fail with usage status 2');
const incompatibleOutput = spawnSync(process.execPath, [scriptPath, 'diagnose', '--json', '--output', 'report.html'], { encoding: 'utf8' });
assert.equal(incompatibleOutput.status, 2, '--json must not create an HTML output');
const missingEnvironment = spawnSync(process.execPath, [scriptPath, 'connection-check', '--env', 'does-not-exist.env'], { encoding: 'utf8' });
assert.equal(missingEnvironment.status, 1, 'a selected missing env file must not fall back to another credential source');
assert.match(missingEnvironment.stderr, /ENV_FILE_NOT_FOUND/);

console.log('shopify-operations-brief tests passed');
