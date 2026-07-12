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
const index = JSON.parse(await readFile(path.join(ROOT, "catalog", "INDEX.json"), "utf8"));
for (const category of index.categories) {
  const catalog = JSON.parse(await readFile(path.join(ROOT, "catalog", category, "skills.json"), "utf8"));
  for (const item of catalog.skills) catalogNames.add(item.name);
}

for (const entry of await readdir(path.join(ROOT, "skills"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const skillPath = path.join(ROOT, "skills", entry.name, "SKILL.md");
  const text = await readFile(skillPath, "utf8");
  const frontmatter = parseFrontmatter(text);
  const label = `skills/${entry.name}/SKILL.md`;

  if (frontmatter.name !== entry.name) errors.push(`${label}: name must match its folder name.`);
  if (frontmatter.slug !== entry.name) errors.push(`${label}: slug must match its folder name.`);
  if (!SEMVER.test(frontmatter.version ?? "")) errors.push(`${label}: version must be stable SemVer.`);
  if (!catalogNames.has(entry.name)) errors.push(`${label}: skill is missing from the catalog.`);
  if (!text.includes("openclaw:")) errors.push(`${label}: missing metadata.openclaw.`);
  if (!text.includes("hermes:")) errors.push(`${label}: missing metadata.hermes.`);
}

if (errors.length > 0) {
  console.error(`Release preflight failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Release preflight passed.");
}
