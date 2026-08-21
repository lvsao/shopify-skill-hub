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
const validateScript = path.join(skillRoot, "scripts", "validate-opportunity-ledger.mjs");
const laneNames = [...LANES];

function research(tier = "minimum", representedLanes = laneNames.slice(0, tier === "full" ? 12 : 8)) {
  const checks = (prefix, count) => Array.from({ length: count }, (_, index) => prefix + " check " + (index + 1));
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
    const host = "prospect-" + (index + 1) + ".example.com";
    return {
      id: "candidate-" + (index + 1),
      target_url: "https://julibees.com/pages/partnership",
      root_domain: host,
      lane: laneNames[index % 8],
      discovery_method: index % 2 === 0 ? "category_led_prospecting" : "competitor_link_path_prospecting",
      route: "editorial_pitch",
      evidence_state: "research_lead",
      opportunity_type: "new_prospect",
      evidence_url: "https://" + host + "/evidence",
      why_relevant: "Deterministic test record.",
      next_action: "Verify before outreach.",
      contact_info: "editor@" + host,
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

test("rejects private literal evidence and unsupported ledger enums", () => {
  assert.equal(isUnsafeLiteralHost("172.16.0.1"), true);
  assert.equal(isUnsafeLiteralHost("[::1]"), true);
  assert.equal(isUnsafeLiteralHost("93.184.216.34"), false);
  const records = candidates();
  records[0].evidence_url = "https://172.16.0.1/evidence";
  records[0].root_domain = "172.16.0.1";
  records[1].lane = "almost_editorial";
  assert.match(validate(ledger(records), { tier: "minimum" }).errors.join("\n"), /safe public http\(s\) URL|approved coverage matrix/);
});

test("requires external evidence and binds target and source domains", () => {
  const mismatch = candidates();
  mismatch[0].evidence_url = "https://petsathome.com/blog/route";
  assert.match(validate(ledger(mismatch), { tier: "minimum" }).errors.join("\n"), /root_domain must match evidence_url/);
  const sameSite = candidates();
  sameSite[0].evidence_url = "https://www.julibees.com/blog/mention";
  sameSite[0].root_domain = "julibees.com";
  assert.match(validate(ledger(sameSite), { tier: "minimum" }).errors.join("\n"), /external source domain/);
  const wrongTarget = candidates();
  wrongTarget[0].target_url = "https://competitor.example.com/page";
  assert.match(validate(ledger(wrongTarget), { tier: "minimum" }).errors.join("\n"), /target_url must match target_root_domain/);
});

test("keeps reclamation secondary and requires both discovery engines", () => {
  const allowed = candidates();
  for (const candidate of allowed.slice(-8)) {
    candidate.opportunity_type = "existing_link_reclamation";
    candidate.lane = "own_mentions_and_reclamation";
    candidate.discovery_method = "existing_mention_search";
    candidate.route = "link_reclamation";
    candidate.evidence_state = "verified_existing_link";
  }
  assert.equal(validate(ledger(allowed), { tier: "minimum" }).ok, true);
  const onlyCategory = candidates();
  for (const candidate of onlyCategory) candidate.discovery_method = "category_led_prospecting";
  assert.match(validate(ledger(onlyCategory), { tier: "minimum" }).errors.join("\n"), /competitor_link_path_prospecting/);
});

test("requires a usable, non-placeholder contact route", () => {
  const records = candidates();
  records[0].contact_info = "";
  records[1].contact_info = "admin@example.com";
  records[2].contact_info = { email: "", form_url: "" };
  records[3].contact_info = "https://prospect-4.example.com/contact";
  const result = validate(ledger(records), { tier: "minimum" });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /contact_info is required|non-placeholder email|include email or form_url/);
});

test("prints help and validates a complete ledger without network access", async () => {
  const { stdout: help } = await execFileAsync(process.execPath, [validateScript, "--help"], { windowsHide: true });
  assert.match(help, /--tier full\|minimum/);
  const temp = await mkdtemp(path.join(os.tmpdir(), "backlink-skill-test-"));
  const input = path.join(temp, "opportunities.json");
  try {
    await writeFile(input, JSON.stringify(ledger(candidates())), "utf8");
    const { stdout } = await execFileAsync(process.execPath, [validateScript, "--input", input, "--tier", "minimum"], { windowsHide: true });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.summary.discoveryMethods.category_led_prospecting, 20);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
