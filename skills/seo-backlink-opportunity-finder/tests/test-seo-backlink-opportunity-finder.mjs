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

function candidates(count = 40) {
  const lanes = [...LANES];
  return Array.from({ length: count }, (_, index) => {
    const host = `prospect-${index + 1}.example.com`;
    const evidenceUrl = `https://${host}/evidence`;
    return {
      id: `candidate-${index + 1}`,
      target_url: "https://julibees.com/pages/partnership",
      root_domain: host,
      lane: lanes[index % 8],
      route: "editorial_pitch",
      evidence_state: "research_lead",
      opportunity_type: "new_prospect",
      evidence_url: evidenceUrl,
      why_relevant: "Deterministic test record.",
      next_action: "Verify before outreach.",
      cost_or_disclosure: "Unknown until verified.",
      quality_risk: "Requires manual review.",
    };
  });
}

test("accepts a complete minimum tier and preserves full-tier expectations", () => {
  const ledger = { target_root_domain: "julibees.com", candidates: candidates() };
  assert.equal(validate(ledger, { tier: "minimum" }).ok, true);
  const full = validate(ledger, { tier: "full" });
  assert.equal(full.ok, false);
  assert.match(full.errors.join("\n"), /at least 100 candidates/);
  assert.deepEqual(tierRequirements("minimum"), { tier: "minimum", minimumCandidates: 40, minimumDomains: 25, minimumLanes: 8, minimumNewProspects: 32 });
});

test("rejects private literal addresses and unsupported ledger enums", () => {
  assert.equal(isUnsafeLiteralHost("172.16.0.1"), true);
  assert.equal(isUnsafeLiteralHost("[::1]"), true);
  assert.equal(isUnsafeLiteralHost("203.0.113.7"), true);
  assert.equal(isUnsafeLiteralHost("93.184.216.34"), false);

  const unsafe = candidates();
  unsafe[0].evidence_url = "https://172.16.0.1/evidence";
  unsafe[0].root_domain = "172.16.0.1";
  assert.match(validate({ target_root_domain: "julibees.com", candidates: unsafe }, { tier: "minimum" }).errors.join("\n"), /safe public http\(s\) URL/);

  const invalidEnum = candidates();
  invalidEnum[0].lane = "almost_editorial";
  assert.match(validate({ target_root_domain: "julibees.com", candidates: invalidEnum }, { tier: "minimum" }).errors.join("\n"), /approved coverage matrix/);
});

test("requires an external evidence source and binds root_domain to evidence_url", () => {
  const mismatch = candidates();
  mismatch[0].evidence_url = "https://petsathome.com/blog/route";
  mismatch[0].root_domain = "julibees.com";
  const mismatchResult = validate({ target_root_domain: "julibees.com", candidates: mismatch }, { tier: "minimum" });
  assert.match(mismatchResult.errors.join("\n"), /root_domain must match evidence_url/);

  const sameSite = candidates();
  sameSite[0].evidence_url = "https://www.julibees.com/blog/mention";
  sameSite[0].root_domain = "julibees.com";
  const sameSiteResult = validate({ target_root_domain: "julibees.com", candidates: sameSite }, { tier: "minimum" });
  assert.match(sameSiteResult.errors.join("\n"), /evidence_url must be on an external source domain/);
});

test("keeps existing-link reclamation separate and caps it at twenty percent", () => {
  const allowed = candidates();
  for (const candidate of allowed.slice(-8)) {
    candidate.opportunity_type = "existing_link_reclamation";
    candidate.lane = "own_mentions_and_reclamation";
    candidate.route = "link_reclamation";
    candidate.evidence_state = "verified_existing_link";
  }
  const allowedResult = validate({ target_root_domain: "julibees.com", candidates: allowed }, { tier: "minimum" });
  assert.equal(allowedResult.ok, true);
  assert.equal(allowedResult.summary.newProspectCount, 32);
  assert.equal(allowedResult.summary.existingReclamationCount, 8);

  const blocked = candidates();
  for (const candidate of blocked.slice(-9)) {
    candidate.opportunity_type = "existing_link_reclamation";
    candidate.lane = "own_mentions_and_reclamation";
    candidate.route = "link_reclamation";
    candidate.evidence_state = "verified_existing_link";
  }
  const blockedResult = validate({ target_root_domain: "julibees.com", candidates: blocked }, { tier: "minimum" });
  assert.match(blockedResult.errors.join("\n"), /at least 32 new_prospect candidates/);
});

test("requires every target_url to belong to the declared target site", () => {
  const records = candidates();
  records[0].target_url = "https://competitor.example.com/page";
  const result = validate({ target_root_domain: "julibees.com", candidates: records }, { tier: "minimum" });
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
    await writeFile(input, JSON.stringify({ target_root_domain: "julibees.com", candidates: candidates() }), "utf8");
    const { stdout } = await execFileAsync(process.execPath, [script, "--input", input, "--tier", "minimum"], { windowsHide: true });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.summary.tier, "minimum");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
