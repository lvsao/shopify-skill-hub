import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

function ipv4ToInt(ip) {
  const values = String(ip).split(".").map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return (((values[0] * 256 + values[1]) * 256 + values[2]) * 256 + values[3]) >>> 0;
}

function ipv4In(ip, start, end) {
  const value = ipv4ToInt(ip);
  return value !== null && value >= start && value <= end;
}

export function isPrivateAddress(address) {
  const value = String(address || "").replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (net.isIPv4(value)) {
    return [[0, 0x00ffffff], [0x0a000000, 0x0affffff], [0x64400000, 0x647fffff], [0x7f000000, 0x7fffffff], [0xa9fe0000, 0xa9feffff], [0xac100000, 0xac1fffff], [0xc0a80000, 0xc0a8ffff], [0xe0000000, 0xffffffff]].some(([start, end]) => ipv4In(value, start, end));
  }
  if (!net.isIPv6(value)) return false;
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") || (value.startsWith("::ffff:") && isPrivateAddress(value.slice(7)));
}

function matchesHost(host, allowed) {
  const normalized = String(allowed).replace(/^\./, "").toLowerCase();
  return host === normalized || host.endsWith(`.${normalized}`);
}

export function validatePublicUrl(raw, { allowedHosts = [] } = {}) {
  const url = new URL(String(raw));
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("PUBLIC_URL_PROTOCOL_INVALID");
  if (url.username || url.password) throw new Error("PUBLIC_URL_CREDENTIALS_BLOCKED");
  const host = url.hostname.toLowerCase();
  if (!host || isPrivateAddress(host)) throw new Error("PUBLIC_URL_PRIVATE_DESTINATION_BLOCKED");
  if (allowedHosts.length && !allowedHosts.some((allowed) => matchesHost(host, allowed))) throw new Error("PUBLIC_URL_OUTSIDE_STORE_HOST");
  return url;
}

export async function assertPublicDestination(raw, options = {}) {
  const url = validatePublicUrl(raw, options);
  if (net.isIP(url.hostname)) return url;
  const addresses = await (options.lookup || dns.lookup)(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("PUBLIC_URL_DNS_PRIVATE_DESTINATION_BLOCKED");
  return url;
}

async function resolvePinnedDestination(raw, options) {
  const url = validatePublicUrl(raw, options);
  if (net.isIP(url.hostname)) return { url, address: url.hostname, family: net.isIPv4(url.hostname) ? 4 : 6 };
  const addresses = await (options.lookup || dns.lookup)(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("PUBLIC_URL_DNS_PRIVATE_DESTINATION_BLOCKED");
  return { url, address: addresses[0].address, family: addresses[0].family };
}

function bodyResponse({ status, headers, body }) {
  const bytes = Buffer.concat(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    async text() { return new TextDecoder().decode(bytes); },
    async json() { return JSON.parse(new TextDecoder().decode(bytes)); },
  };
}

function requestPinned(destination, init, options) {
  const { url, address, family } = destination;
  const transport = url.protocol === "https:" ? https : http;
  const maxBytes = Number(options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: init.method || "GET",
      headers: init.headers,
      servername: url.hostname,
      lookup(_hostname, lookupOptions, callback) {
        if (lookupOptions?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
    }, (response) => {
      const body = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error("PUBLIC_RESPONSE_TOO_LARGE"));
          return;
        }
        body.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => resolve(bodyResponse({ status: response.statusCode || 0, headers: response.headers, body })));
    });
    request.once("error", reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error("PUBLIC_FETCH_TIMEOUT")));
    request.end(init.body);
  });
}

export async function fetchPublic(raw, init = {}, options = {}) {
  let current = String(raw);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const destination = await resolvePinnedDestination(current, options);
    const response = await requestPinned(destination, init, options);
    if (response.status < 300 || response.status >= 400) return { response, finalUrl: current, redirects };
    const location = response.headers.get("location");
    if (!location) throw new Error("PUBLIC_REDIRECT_MISSING_LOCATION");
    if (redirects === MAX_REDIRECTS) throw new Error("PUBLIC_REDIRECT_LIMIT_EXCEEDED");
    current = new URL(location, current).href;
  }
  throw new Error("PUBLIC_FETCH_FAILED");
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function extractMeta(html) {
  const source = String(html || "");
  const value = (pattern) => source.match(pattern)?.[1]?.trim() || null;
  const all = (pattern) => [...source.matchAll(pattern)].map((match) => match[1]?.trim()).filter(Boolean);
  const tags = (pattern) => [...source.matchAll(pattern)].map((match) => match[0]);
  return {
    title: value(/<title\b[^>]*>([\s\S]*?)<\/title>/i),
    description: value(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) || value(/<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i),
    canonical: value(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i),
    ogTitle: value(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i),
    ogImage: value(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i),
    favicon: value(/<link\b[^>]*rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i),
    htmlLang: value(/<html\b[^>]*\blang=["']([^"']+)["'][^>]*>/i),
    robots: value(/<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']*)["'][^>]*>/i),
    links: all(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>/gi),
    scripts: all(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi),
    inlineScripts: all(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi).map((value) => value.slice(0, 100_000)),
    jsonLd: all(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
    imageTags: tags(/<img\b[^>]*>/gi),
  };
}

export function robotsAllowsRoot(text, userAgent = "Selofy-StoreSetupAuditor") {
  const groups = []; let agents = []; let rules = [];
  const close = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase(); const value = match[2].trim();
    if (key === "user-agent") { if (rules.length) close(); agents.push(value.toLowerCase()); }
    else if ((key === "allow" || key === "disallow") && agents.length) rules.push({ key, value });
  }
  close();
  const normalized = userAgent.toLowerCase();
  const group = groups.find((entry) => entry.agents.some((agent) => agent !== "*" && normalized.includes(agent))) || groups.find((entry) => entry.agents.includes("*"));
  const matching = (group?.rules || []).filter((rule) => rule.value === "/");
  return !matching.some((rule) => rule.key === "disallow");
}
