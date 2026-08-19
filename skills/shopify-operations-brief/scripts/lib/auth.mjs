// Shopify Admin connection helpers. Credentials are read only from the selected
// private environment file (or explicitly supplied process environment).
import { execFile } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_API_VERSION = '2026-07';
const DEFAULT_SCOPES = 'read_orders,read_products,read_inventory';
const ACCESS_METHODS = new Set([
  'shopify_cli_oauth',
  'dev_dashboard_client_credentials',
  'admin_api_access_token',
]);

function parseEnv(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

export function loadEnvFile(customPath) {
  if (customPath) {
    const resolved = path.resolve(customPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`ENV_FILE_NOT_FOUND: ${resolved}`);
    }
    return parseEnv(fs.readFileSync(resolved, 'utf8'));
  }

  const defaultPath = path.resolve(process.cwd(), 'skill-hub.env');
  if (fs.existsSync(defaultPath)) {
    return parseEnv(fs.readFileSync(defaultPath, 'utf8'));
  }

  return { ...process.env };
}

function getStoreDomain(envConfig) {
  return envConfig.SKILL_HUB_SHOPIFY_STORE_DOMAIN || envConfig.SHOPIFY_TEST_STORE_DOMAIN;
}

function isPrivateAddress(address) {
  const normalized = address.toLowerCase();
  if (net.isIP(normalized) === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }

  if (net.isIP(normalized) === 6) {
    return normalized === '::1' || normalized === '::' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb') ||
      normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.') || normalized.startsWith('::ffff:169.254.');
  }

  return true;
}

export async function validateShopDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('MISSING_STORE_DOMAIN: Set SKILL_HUB_SHOPIFY_STORE_DOMAIN in the selected private environment file.');
  }

  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    throw new Error('INVALID_STORE_DOMAIN: Use a Shopify .myshopify.com admin domain.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    url.protocol !== 'https:' || url.username || url.password || url.port ||
    (url.pathname && url.pathname !== '/') || url.search || url.hash ||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(hostname)
  ) {
    throw new Error('INVALID_STORE_DOMAIN: Only an HTTPS <store>.myshopify.com domain is accepted.');
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('STORE_DNS_LOOKUP_FAILED: Unable to resolve the selected .myshopify.com domain.');
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('UNSAFE_STORE_DESTINATION: Shopify store resolution returned an unsafe address.');
  }

  return hostname;
}

function getApiVersion(envConfig) {
  const apiVersion = (envConfig.SKILL_HUB_SHOPIFY_API_VERSION || DEFAULT_API_VERSION).trim();
  if (!/^\d{4}-(01|04|07|10)$/.test(apiVersion)) {
    throw new Error('INVALID_API_VERSION: Use a stable Shopify Admin API version such as 2026-07.');
  }
  return apiVersion;
}

function graphQLError(response) {
  const errors = Array.isArray(response?.errors) ? response.errors : [];
  if (!errors.length) return null;

  const messages = errors.map((error) => String(error?.message || 'Unknown GraphQL error'));
  const requiresScope = errors.some((error) => {
    const code = String(error?.extensions?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return code.includes('ACCESS') || code.includes('FORBIDDEN') ||
      message.includes('access denied') || message.includes('not authorized');
  });

  const summary = messages.map((message) => message.slice(0, 180)).join('; ');
  return new Error(`${requiresScope ? 'SCOPE_UPDATE_REQUIRED' : 'GRAPHQL_REQUEST_FAILED'}: ${summary}`);
}

export function postGraphQL(shop, token, query, variables = {}, apiVersion = DEFAULT_API_VERSION) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query, variables });
    const request = https.request({
      hostname: shop,
      path: `/admin/api/${apiVersion}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Shopify-Access-Token': token,
      },
    }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          reject(new Error(`GRAPHQL_RESPONSE_INVALID: Shopify returned HTTP ${response.statusCode}.`));
          return;
        }

        const resolvedVersion = response.headers['x-shopify-api-version'];
        if (resolvedVersion && resolvedVersion !== apiVersion) {
          reject(new Error(`API_VERSION_MISMATCH: Requested ${apiVersion}, Shopify used ${resolvedVersion}. Update SKILL_HUB_SHOPIFY_API_VERSION before retrying.`));
          return;
        }
        if (response.statusCode >= 400) {
          reject(new Error(`SHOPIFY_HTTP_${response.statusCode}: Request was rejected by Shopify.`));
          return;
        }
        const error = graphQLError(parsed);
        if (error) {
          reject(error);
          return;
        }
        if (!parsed?.data) {
          reject(new Error('GRAPHQL_RESPONSE_INVALID: Shopify returned no data.'));
          return;
        }
        resolve(parsed.data);
      });
    });
    request.on('error', (error) => reject(new Error(`SHOPIFY_NETWORK_ERROR: ${error.code || error.message}`)));
    request.end(payload);
  });
}

async function exchangeClientCredentials(shop, clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString();
    const request = https.request({
      hostname: shop,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed.access_token) {
            reject(new Error(`DEV_DASHBOARD_AUTH_FAILED: Shopify returned HTTP ${response.statusCode}.`));
            return;
          }
          resolve(parsed.access_token);
        } catch {
          reject(new Error(`DEV_DASHBOARD_AUTH_FAILED: Shopify returned HTTP ${response.statusCode}.`));
        }
      });
    });
    request.on('error', (error) => reject(new Error(`DEV_DASHBOARD_AUTH_FAILED: ${error.code || error.message}`)));
    request.end(payload);
  });
}

function parseCliJson(stdout) {
  const trimmed = stdout.trim();
  try { return JSON.parse(trimmed); } catch { /* Try a JSON payload after a CLI progress line. */ }
  const firstObject = trimmed.indexOf('{');
  if (firstObject >= 0) {
    try { return JSON.parse(trimmed.slice(firstObject)); } catch { /* Fall through. */ }
  }
  throw new Error('CLI_RESPONSE_INVALID: Shopify CLI did not return a JSON GraphQL response.');
}

async function runCli(cliPath, args) {
  try {
    return await execFileAsync(cliPath, args, {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('CLI_NOT_FOUND: Install Shopify CLI or set SKILL_HUB_SHOPIFY_CLI_PATH.');
    }
    throw new Error(`CLI_REQUEST_FAILED: ${String(error?.stderr || error?.message || 'Shopify CLI failed').slice(0, 300)}`);
  }
}

async function createCliClient(envConfig, shop, apiVersion) {
  const cliPath = envConfig.SKILL_HUB_SHOPIFY_CLI_PATH || 'shopify';
  const scopes = envConfig.SKILL_HUB_SHOPIFY_SCOPES || DEFAULT_SCOPES;
  await runCli(cliPath, ['store', 'auth', '--store', shop, '--scopes', scopes]);

  return {
    shop,
    accessMethod: 'shopify_cli_oauth',
    apiVersion,
    async query(query, variables = {}) {
      const { stdout } = await runCli(cliPath, [
        'store', 'execute',
        '--store', shop,
        '--query', query,
        '--variables', JSON.stringify(variables),
        '--version', apiVersion,
        '--json',
      ]);
      const response = parseCliJson(stdout);
      const error = graphQLError(response);
      if (error) throw error;
      if (!response?.data) throw new Error('CLI_RESPONSE_INVALID: Shopify CLI returned no GraphQL data.');
      return response.data;
    },
  };
}

export async function createShopifyClient(envConfig = {}) {
  const shop = await validateShopDomain(getStoreDomain(envConfig));
  const accessMethod = (envConfig.SKILL_HUB_SHOPIFY_ACCESS_METHOD || 'shopify_cli_oauth').trim();
  if (!ACCESS_METHODS.has(accessMethod)) {
    throw new Error(`INVALID_ACCESS_METHOD: Choose one of ${[...ACCESS_METHODS].join(', ')}.`);
  }

  const apiVersion = getApiVersion(envConfig);
  if (accessMethod === 'shopify_cli_oauth') {
    return createCliClient(envConfig, shop, apiVersion);
  }

  let token;
  if (accessMethod === 'dev_dashboard_client_credentials') {
    const clientId = envConfig.SKILL_HUB_SHOPIFY_CLIENT_ID;
    const clientSecret = envConfig.SKILL_HUB_SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('MISSING_DEV_DASHBOARD_CREDENTIALS: Set SKILL_HUB_SHOPIFY_CLIENT_ID and SKILL_HUB_SHOPIFY_CLIENT_SECRET.');
    }
    token = await exchangeClientCredentials(shop, clientId, clientSecret);
  } else {
    token = envConfig.SKILL_HUB_SHOPIFY_ACCESS_TOKEN || envConfig.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    if (!token) {
      throw new Error('MISSING_ACCESS_TOKEN: Set SKILL_HUB_SHOPIFY_ACCESS_TOKEN for admin_api_access_token mode.');
    }
  }

  return {
    shop,
    accessMethod,
    apiVersion,
    query: (query, variables = {}) => postGraphQL(shop, token, query, variables, apiVersion),
  };
}
