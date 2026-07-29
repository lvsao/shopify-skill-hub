#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_PER_DOMAIN = 3;
const TIERS = Object.freeze({
  full: Object.freeze({ minimumCandidates: 100, minimumDomains: 60, minimumLanes: 10, minimumNewProspects: 80 }),
  minimum: Object.freeze({ minimumCandidates: 40, minimumDomains: 25, minimumLanes: 8, minimumNewProspects: 32 }),
});
const LANES = new Set([
  "own_mentions_and_reclamation",
  "target_site_citable_resources",
  "supplied_competitor_links",
  "comparable_brand_paths",
  "independent_editorial",
  "expert_and_reference_resources",
  "trade_and_business_media",
  "partnerships_and_collaborators",
  "events_showcases_and_awards",
  "reputable_listings",
  "creator_and_affiliate_coverage",
  "replacement_opportunities",
]);
const ROUTES = new Set(["editorial_pitch", "resource_inclusion", "link_reclamation", "submission", "partnership", "showcase_or_award", "affiliate_or_creator", "other_disclosed"]);
const EVIDENCE_STATES = new Set(["verified_existing_link", "verified_submission_route", "verified_relevant_editorial_target", "research_lead"]);
const OPPORTUNITY_TYPES = new Set(["new_prospect", "existing_link_reclamation"]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) { args[key] = next; index += 1; }
    else args[key] = true;
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node validate-opportunity-ledger.mjs --input opportunities.json [--tier full|minimum]

Tiers:
  full     100 candidates, 60 root domains, 10 coverage lanes, 80 new prospects (default)
  minimum  40 candidates, 25 root domains, 8 coverage lanes, 32 new prospects`);
}

function tierRequirements(value = "full") {
  const tier = String(value || "full").trim().toLowerCase();
  if (!Object.hasOwn(TIERS, tier)) throw new Error("INVALID_TIER: use full or minimum.");
  return { tier, ...TIERS[tier] };
}

function isUnsafeIpv4(hostname) {
  const [first, second, third] = hostname.split(".").map(Number);
  return first === 0
    || first === 10
    || first === 127
    || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19 || second === 51))
    || (first === 203 && second === 0 && third === 113);
}

function isUnsafeLiteralHost(value) {
  const hostname = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  const family = isIP(hostname);
  if (family === 4) return isUnsafeIpv4(hostname);
  if (family !== 6) return false;
  if (hostname === "::" || hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(hostname) || hostname.startsWith("ff") || hostname.startsWith("2001:db8:")) return true;
  const mapped = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && isUnsafeIpv4(mapped[1]));
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function normalizeRootDomain(value) {
  const domain = normalizeHost(value);
  if (!domain || domain.includes("/") || domain.includes(":")) return "";
  return isUnsafeLiteralHost(domain) ? "" : domain;
}

function hostMatchesRootDomain(hostname, rootDomain) {
  const host = normalizeHost(hostname);
  const root = normalizeRootDomain(rootDomain);
  return Boolean(host && root && (host === root || host.endsWith(`.${root}`)));
}

function samePublicSite(firstHostname, secondHostname) {
  const first = normalizeHost(firstHostname);
  const second = normalizeHost(secondHostname);
  return Boolean(first && second && (first === second || first.endsWith(`.${second}`) || second.endsWith(`.${first}`)));
}

function asPublicUrl(value, field, index, errors) {
  try {
    const url = new URL(String(value || ""));
    if (!new Set(["http:", "https:"]).has(url.protocol) || !url.hostname) throw new Error("not public http(s)");
    if (isUnsafeLiteralHost(url.hostname)) throw new Error("local address");
    return url;
  } catch (error) {
    errors.push(`candidate ${index}: ${field} must be a safe public http(s) URL.`);
    return null;
  }
}

function requiredText(candidate, field, index, errors) {
  if (!String(candidate[field] || "").trim()) errors.push(`candidate ${index}: ${field} is required.`);
}

function validate(ledger, options = {}) {
  const requirements = tierRequirements(options.tier);
  const candidates = ledger?.candidates;
  const errors = [];
  if (!Array.isArray(candidates)) return { ok: false, errors: ["Ledger must be an object with target_root_domain and a candidates array."] };
  const targetRootDomain = normalizeRootDomain(ledger.target_root_domain);
  if (!targetRootDomain) errors.push("Ledger target_root_domain must be a safe public hostname.");
  if (candidates.length < requirements.minimumCandidates) errors.push(`Expected at least ${requirements.minimumCandidates} candidates; received ${candidates.length}.`);
  const ids = new Set();
  const domains = new Map();
  const lanes = new Set();
  const states = {};
  let newProspectCount = 0;
  let existingReclamationCount = 0;
  candidates.forEach((candidate, arrayIndex) => {
    const index = arrayIndex + 1;
    for (const field of ["id", "root_domain", "lane", "route", "evidence_state", "opportunity_type", "why_relevant", "next_action", "cost_or_disclosure", "quality_risk"]) requiredText(candidate, field, index, errors);
    if (ids.has(candidate.id)) errors.push(`candidate ${index}: id must be unique.`);
    ids.add(candidate.id);
    const target = asPublicUrl(candidate.target_url, "target_url", index, errors);
    const evidence = asPublicUrl(candidate.evidence_url, "evidence_url", index, errors);
    const rootDomain = normalizeRootDomain(candidate.root_domain);
    if (!rootDomain && String(candidate.root_domain || "").trim()) errors.push(`candidate ${index}: root_domain must be a safe public hostname.`);
    if (target && targetRootDomain && !hostMatchesRootDomain(target.hostname, targetRootDomain)) errors.push(`candidate ${index}: target_url must match target_root_domain.`);
    if (evidence && rootDomain && !hostMatchesRootDomain(evidence.hostname, rootDomain)) errors.push(`candidate ${index}: root_domain must match evidence_url.`);
    if (target && evidence && samePublicSite(target.hostname, evidence.hostname)) errors.push(`candidate ${index}: evidence_url must be on an external source domain, not the target site.`);
    if (rootDomain) domains.set(rootDomain, (domains.get(rootDomain) || 0) + 1);
    if (!LANES.has(candidate.lane)) errors.push(`candidate ${index}: lane is not in the approved coverage matrix.`);
    else lanes.add(candidate.lane);
    if (!ROUTES.has(candidate.route)) errors.push(`candidate ${index}: route is not an approved acquisition route.`);
    if (!EVIDENCE_STATES.has(candidate.evidence_state)) errors.push(`candidate ${index}: evidence_state is invalid.`);
    else states[candidate.evidence_state] = (states[candidate.evidence_state] || 0) + 1;
    const opportunityType = String(candidate.opportunity_type || "").trim();
    if (!OPPORTUNITY_TYPES.has(opportunityType)) errors.push(`candidate ${index}: opportunity_type is invalid.`);
    else if (opportunityType === "new_prospect") {
      newProspectCount += 1;
      if (candidate.evidence_state === "verified_existing_link") errors.push(`candidate ${index}: new_prospect cannot use verified_existing_link evidence.`);
    } else {
      existingReclamationCount += 1;
      if (candidate.lane !== "own_mentions_and_reclamation") errors.push(`candidate ${index}: existing_link_reclamation must use the own_mentions_and_reclamation lane.`);
      if (candidate.route !== "link_reclamation") errors.push(`candidate ${index}: existing_link_reclamation must use the link_reclamation route.`);
    }
    if (String(candidate.evidence_state || "").startsWith("verified_") && !evidence) errors.push(`candidate ${index}: verified evidence requires a valid evidence_url.`);
  });
  if (domains.size < requirements.minimumDomains) errors.push(`Expected at least ${requirements.minimumDomains} root domains; received ${domains.size}.`);
  if (lanes.size < requirements.minimumLanes) errors.push(`Expected at least ${requirements.minimumLanes} coverage lanes; received ${lanes.size}.`);
  if (newProspectCount < requirements.minimumNewProspects) errors.push(`Expected at least ${requirements.minimumNewProspects} new_prospect candidates; received ${newProspectCount}.`);
  for (const [domain, count] of domains) if (count > MAX_PER_DOMAIN) errors.push(`${domain}: exceeds the maximum of ${MAX_PER_DOMAIN} candidates per root domain.`);
  return {
    ok: errors.length === 0,
    errors,
    summary: { ...requirements, targetRootDomain, candidateCount: candidates.length, rootDomainCount: domains.size, laneCount: lanes.size, newProspectCount, existingReclamationCount, evidenceStates: states },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return usage();
  if (!args.input) {
    usage();
    process.exitCode = 1;
    return;
  }
  const ledger = JSON.parse(await readFile(args.input, "utf8"));
  const result = validate(ledger, { tier: args.tier });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  main().catch((error) => { console.error(JSON.stringify({ ok: false, errors: [error.message] }, null, 2)); process.exitCode = 1; });
}

export {
  EVIDENCE_STATES,
  LANES,
  MAX_PER_DOMAIN,
  OPPORTUNITY_TYPES,
  ROUTES,
  TIERS,
  asPublicUrl,
  hostMatchesRootDomain,
  isUnsafeLiteralHost,
  normalizeHost,
  normalizeRootDomain,
  samePublicSite,
  tierRequirements,
  validate,
};
