#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const ROOT = process.cwd();
const SEMVER = /^\d+\.\d+\.\d+$/;
const execFileAsync = promisify(execFile);

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  return match[1].split(/\r?\n/).reduce((values, line) => {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (field) values[field[1]] = field[2].trim().replace(/^["']|["']$/g, "");
    return values;
  }, {});
}

function readmeSkillSlugs(text) {
  return new Set([...text.matchAll(/\]\(\.\/skills\/([^\)\s]+)\)/g)].map((match) => match[1]));
}

function findSetDifference(expected, actual) {
  return [...expected].filter((value) => !actual.has(value)).sort();
}

const errors = [];
const { stdout: trackedPathOutput } = await execFileAsync("git", ["ls-files", "-z"], { cwd: ROOT, maxBuffer: 1024 * 1024 });
const trackedPaths = trackedPathOutput.split("\0").filter(Boolean);
const prohibitedTrackedPathRules = [
  { pattern: /(^|\/)\.workbuddy(?:\/|$)/i, label: "agent memory" },
  { pattern: /(^|\/)(?:test|tests|fixtures|test-results|playwright-report)(?:\/|$)/i, label: "test or fixture artifact" },
  { pattern: /(^|\/)(?:test-[^/]+|[^/]+\.(?:test|spec))\.(?:[cm]?[jt]sx?)$/i, label: "test script" },
  { pattern: /(^|\/)[^/]*(?:audit|test|demo)-report\.(?:html|json|md)$/i, label: "generated report" },
];
for (const trackedPath of trackedPaths) {
  const match = prohibitedTrackedPathRules.find((rule) => rule.pattern.test(trackedPath));
  if (match) errors.push(`${trackedPath}: tracked ${match.label} is not allowed in the published repository.`);
}
const catalogNames = new Set();
const catalogItems = new Map();
const publishedSlugs = new Set();
const skillDirectories = new Set();
const index = JSON.parse(await readFile(path.join(ROOT, "catalog", "INDEX.json"), "utf8"));
for (const category of index.categories) {
  const catalog = JSON.parse(await readFile(path.join(ROOT, "catalog", category, "skills.json"), "utf8"));
  for (const item of catalog.skills) {
    catalogNames.add(item.name);
    catalogItems.set(item.name, item);
  }
}

const systemBadgeIds = new Set([
  "shopify-store-access",
  "external-api-credential",
  "vision-model",
]);
const systemBadgeStatuses = new Set(["required", "optional", "not_required"]);

for (const entry of await readdir(path.join(ROOT, "skills"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  skillDirectories.add(entry.name);
  const skillPath = path.join(ROOT, "skills", entry.name, "SKILL.md");
  const text = await readFile(skillPath, "utf8");
  const frontmatter = parseFrontmatter(text);
  const label = `skills/${entry.name}/SKILL.md`;

  if (!frontmatter.name) errors.push(`${label}: missing name.`);
  if (!frontmatter.slug) errors.push(`${label}: missing slug.`);
  if (frontmatter.name !== frontmatter.slug) errors.push(`${label}: name and slug must describe the same published identity.`);
  if (publishedSlugs.has(frontmatter.slug)) errors.push(`${label}: slug must be unique across published skills.`);
  publishedSlugs.add(frontmatter.slug);
  if (!SEMVER.test(frontmatter.version ?? "")) errors.push(`${label}: version must be stable SemVer.`);
  if (!catalogNames.has(entry.name)) errors.push(`${label}: skill is missing from the catalog.`);
  const catalogItem = catalogItems.get(entry.name);
  if (!Array.isArray(catalogItem?.badges) || catalogItem.badges.length !== systemBadgeIds.size) {
    errors.push(`${label}: catalog must declare exactly the three system badges.`);
  } else {
    const seenBadges = new Set();
    for (const badge of catalogItem.badges) {
      if (!badge || !systemBadgeIds.has(badge.id) || seenBadges.has(badge.id)) {
        errors.push(`${label}: catalog contains an invalid or duplicate system badge.`);
        break;
      }
      if (!systemBadgeStatuses.has(badge.status)) {
        errors.push(`${label}: badge ${badge.id} has an invalid status.`);
        break;
      }
      seenBadges.add(badge.id);
    }
    if (seenBadges.size !== systemBadgeIds.size) {
      errors.push(`${label}: catalog is missing one or more system badges.`);
    }
  }
  if (!text.includes("openclaw:")) errors.push(`${label}: missing metadata.openclaw.`);
  if (!text.includes("hermes:")) errors.push(`${label}: missing metadata.hermes.`);
}

for (const readmeName of ["README.md", "README.zh-CN.md"]) {
  const readmePath = path.join(ROOT, readmeName);
  const readmeSlugs = readmeSkillSlugs(await readFile(readmePath, "utf8"));
  const missing = findSetDifference(skillDirectories, readmeSlugs);
  const extra = findSetDifference(readmeSlugs, skillDirectories);
  if (missing.length || extra.length) {
    const details = [
      missing.length ? `missing: ${missing.join(", ")}` : null,
      extra.length ? `extra: ${extra.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    errors.push(`${readmeName}: skill index does not match skills/ (${details}).`);
  }
}

if (errors.length > 0) {
  console.error(`Release preflight failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Release preflight passed.");
}
