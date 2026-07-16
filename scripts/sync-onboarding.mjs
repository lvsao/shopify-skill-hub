#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const templatePath = path.join(root, "shared", "shopify-admin-onboarding", "core.md");
const manifestPath = path.join(root, "shared", "shopify-admin-onboarding", "manifest.json");
const mode = process.argv.includes("--write") ? "write" : "check";

function render(template, values) {
  return template.replace(/\{\{(intro|publicAccess|scopes|workflowBoundary)\}\}/g, (_, key) => values[key]);
}

const [template, manifestText] = await Promise.all([
  readFile(templatePath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
const manifest = JSON.parse(manifestText);
const failures = [];

for (const skill of manifest.skills) {
  const fingerprint = createHash("sha256")
    .update(template)
    .update("\0")
    .update(JSON.stringify(skill))
    .digest("hex");
  const header = [
    "<!-- GENERATED FILE: edit shared/shopify-admin-onboarding/core.md or manifest.json, then run node scripts/sync-onboarding.mjs --write. -->",
    `<!-- onboarding-contract: ${manifest.contractVersion}; source-sha256: ${fingerprint} -->`,
    "",
  ].join("\n");
  const expected = `${header}${render(template, skill)}`.replace(/\r\n/g, "\n").replace(/\n*$/, "\n");
  const outputPath = path.join(root, skill.path);
  const actual = await readFile(outputPath, "utf8").catch(() => null);

  if (actual?.replace(/\r\n/g, "\n") === expected) continue;
  if (mode === "write") {
    await writeFile(outputPath, expected, "utf8");
    console.log(`SYNCED ${skill.path}`);
  } else {
    failures.push(skill.path);
  }
}

if (failures.length) {
  console.error(`Onboarding guides are stale. Run: node scripts/sync-onboarding.mjs --write\n${failures.join("\n")}`);
  process.exitCode = 1;
} else if (mode === "check") {
  console.log(`OK: ${manifest.skills.length} onboarding guides match contract ${manifest.contractVersion}`);
}
