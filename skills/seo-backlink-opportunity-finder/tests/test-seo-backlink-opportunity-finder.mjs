import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  LANES,
  isUnsafeLiteralHost,
  tierRequirements,
  validate,
} from "../scripts/validate-opportunity-ledger.mjs";

const execFileAsync = promisify(execFile);
const skillRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(skillRoot, "scripts", "validate-opportunity-ledger.mjs");
const laneNames = [...LANES];

function research(tier = "minimum", representedLanes = laneNames.slice(0, tier === "full" ? 12 : 8)) {
  const checks = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix} check ${index + 1}`);
  const count = tier === "full" ? 8 : 4;
  return {
    tier,
    category_seeds: ["real category", "real use case"],
    competitor_domains: ["competitor.example"],
    method_checks: {
      category_led_prospecting: checks("category", count),
      competitor_link_path_prospecting: checks("competitor", count),
    },
    lane_checks: Object.fromEntries(representedLanes.map((lane) => [lane, checks(lane, count)])),
    omitted_lanes: laneNames.filter((lane) => !representedLanes.includes(lane)),
  };
}

function candidates(count = 40) {
  return Array.from({ length: count }, (_, index) => {
    const host = `prospect-${index + 1}.example.com`;
    const discoveryMethod = index % 2 === 0 ? "category_led_prospecting" : "competitor_link_path_prospecting";
    return {
      id: `candidate-${index + 1}`,
      target_url: "https://julibees.com/pages/partnership",
      root_domain: host,
      lane: laneNames[index % 8],
      discovery_method: discoveryMethod,
      route: "editorial_pitch",
      evidence_state: "research_lead",
      opportunity_type: "new_prospect",
      evidence_url: `https://${host}/evidence`,
      why_relevant: "Deterministic test record.",
      next_action: "Verify before outreach.",
      cost_or_disclosure: "Unknown until verified.",
      quality_risk: "Requires manual review.",
    };
  });
}

function ledger(records, tier = "minimum") {
  return { target_root_domain: "julibees.com", research: research(tier), candidates: records };
}

test("accepts a complete minimum tier and preserves full-tier expectations", () => {
  const minimumLedger = ledger(candidates());
  assert.equal(validate(minimumLedger, { tier: "minimum" }).ok, true);
  const full = validate(minimumLedger, { tier: "full" });
  assert.equal(full.ok, false);
  assert.match(full.errors.join("\n"), /research\.tier must match|at least 100 candidates/);
  assert.deepEqual(tierRequirements("minimum"), { tier: "minimum", minimumCandidates: 40, minimumDomains: 25, minimumLanes: 8, minimumNewProspects: 32, minimumMethodChecks: 4, minimumLaneChecks: 4 });
});

test("rejects private literal addresses and unsupported ledger enums", () => {
  assert.equal(isUnsafeLiteralHost("172.16.0.1"), true);
  assert.equal(isUnsafeLiteralHost("[::1]"), true);
  assert.equal(isUnsafeLiteralHost("203.0.113.7"), true);
  assert.equal(isUnsafeLiteralHost("93.184.216.34"), false);

  const unsafe = candidates();
  unsafe[0].evidence_url = "https://172.16.0.1/evidence";
  unsafe[0].root_domain = "172.16.0.1";
  assert.match(validate(ledger(unsafe), { tier: "minimum" }).errors.join("\n"), /safe public http\(s\) URL/);

  const invalidEnum = candidates();
  invalidEnum[0].lane = "almost_editorial";
  invalidEnum[1].discovery_method = "guessing";
  assert.match(validate(ledger(invalidEnum), { tier: "minimum" }).errors.join("\n"), /approved coverage matrix|discovery_method is invalid/);
});

test("requires an external evidence source and binds root_domain to evidence_url", () => {
  const mismatch = candidates();
  mismatch[0].evidence_url = "https://petsathome.com/blog/route";
  mismatch[0].root_domain = "julibees.com";
  const mismatchResult = validate(ledger(mismatch), { tier: "minimum" });
  assert.match(mismatchResult.errors.join("\n"), /root_domain must match evidence_url/);

  const sameSite = candidates();
  sameSite[0].evidence_url = "https://www.julibees.com/blog/mention";
  sameSite[0].root_domain = "julibees.com";
  const sameSiteResult = validate(ledger(sameSite), { tier: "minimum" });
  assert.match(sameSiteResult.errors.join("\n"), /evidence_url must be on an external source domain/);

  const searchResult = candidates();
  searchResult[0].evidence_url = "https://www.google.com/search?q=backlinks";
  assert.match(validate(ledger(searchResult), { tier: "minimum" }).errors.join("\n"), /safe public http\(s\) URL/);
});

test("keeps existing-link reclamation separate and caps it at twenty percent", () => {
  const allowed = candidates();
  for (const candidate of allowed.slice(-8)) {
    candidate.opportunity_type = "existing_link_reclamation";
    candidate.lane = "own_mentions_and_reclamation";
    candidate.discovery_method = "existing_mention_search";
    candidate.route = "link_reclamation";
    candidate.evidence_state = "verified_existing_link";
  }
  const allowedResult = validate(ledger(allowed), { tier: "minimum" });
  assert.equal(allowedResult.ok, true);
  assert.equal(allowedResult.summary.newProspectCount, 32);
  assert.equal(allowedResult.summary.existingReclamationCount, 8);

  const blocked = candidates(50);
  for (const candidate of blocked.slice(-11)) {
    candidate.opportunity_type = "existing_link_reclamation";
    candidate.lane = "own_mentions_and_reclamation";
    candidate.discovery_method = "existing_mention_search";
    candidate.route = "link_reclamation";
    candidate.evidence_state = "verified_existing_link";
  }
  const blockedResult = validate(ledger(blocked), { tier: "minimum" });
  assert.match(blockedResult.errors.join("\n"), /may not exceed 20%/);
});

test("requires both category-led and competitor-led new prospecting", () => {
  const records = candidates();
  for (const candidate of records) candidate.discovery_method = "category_led_prospecting";
  const result = validate(ledger(records), { tier: "minimum" });
  assert.match(result.errors.join("\n"), /Candidates must include new prospects from competitor_link_path_prospecting/);
});

test("requires every target_url to belong to the declared target site", () => {
  const records = candidates();
  records[0].target_url = "https://competitor.example.com/page";
  const result = validate(ledger(records), { tier: "minimum" });
  assert.match(result.errors.join("\n"), /target_url must match target_root_domain/);
});

test("prints discoverable help without network access", async () => {
  const { stdout } = await execFileAsync(process.execPath, [script, "--help"], { windowsHide: true });
  assert.match(stdout, /--tier full\|minimum/);
});

test("validates the selected tier through the CLI without network access", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "backlink-skill-test-"));
  const input = path.join(temp, "opportunities.json");
  try {
    await writeFile(input, JSON.stringify(ledger(candidates())), "utf8");
    const { stdout } = await execFileAsync(process.execPath, [script, "--input", input, "--tier", "minimum"], { windowsHide: true });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.summary.tier, "minimum");
    assert.equal(result.summary.discoveryMethods.category_led_prospecting, 20);
    assert.equal(result.summary.discoveryMethods.competitor_link_path_prospecting, 20);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
