#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SEMVER = /^\d+\.\d+\.\d+$/;

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  return match[1].split(/\r?\n/).reduce((values, line) => {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (field) values[field[1]] = field[2].trim().replace(/^["']|["']$/g, "");
    return values;
  }, {});
}

const errors = [];
const catalogNames = new Set();
const catalogItems = new Map();
const publishedSlugs = new Set();
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

if (errors.length > 0) {
  console.error(`Release preflight failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Release preflight passed.");
}
