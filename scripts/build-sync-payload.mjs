#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const REPOSITORY = process.env.GITHUB_REPOSITORY || "lvsao/shopify-skill-hub";
const COMMIT_SHA = process.env.GITHUB_SHA || null;
const BRANCH = process.env.GITHUB_REF_NAME || "main";

const PUBLIC_FILE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".mjs",
  ".js",
  ".json",
  ".yaml",
  ".yml",
  ".txt",
]);

const BLOCKED_PATH_PATTERNS = [
  /^\.env/i,
  /(^|\/)\.env/i,
  /secret/i,
  /credential/i,
  /private[-_]?key/i,
  /token/i,
];

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};

  const frontmatter = text.slice(4, end).trim();
  const values = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    value = value.replace(/^["']|["']$/g, "");
    values[key] = value;
  }
  return values;
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

function languageFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".md" || extension === ".mdx") return "markdown";
  if (extension === ".mjs" || extension === ".js") return "javascript";
  if (extension === ".json") return "json";
  if (extension === ".yaml" || extension === ".yml") return "yaml";
  return "text";
}

function isPublicFilePath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("..")) return false;
  if (BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return PUBLIC_FILE_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function collectSkillFiles(skillPath) {
  const absoluteSkillPath = path.join(ROOT, skillPath);
  const files = await listFiles(absoluteSkillPath);
  const publicFiles = [];

  for (const file of files) {
    const relativePath = path.relative(ROOT, file).replaceAll("\\", "/");
    if (!isPublicFilePath(relativePath)) continue;

    const content = await readFile(file, "utf8");
    if (content.length > 100_000) continue;

    publicFiles.push({
      path: relativePath,
      language: languageFromPath(relativePath),
      content,
      size: Buffer.byteLength(content, "utf8"),
      sha: sha(content),
    });
  }

  return publicFiles.sort((left, right) => left.path.localeCompare(right.path));
}

async function collectSkills() {
  const index = await readJson(path.join(ROOT, "catalog", "INDEX.json"));
  const skills = [];

  for (const categorySlug of index.categories) {
    const categoryPath = path.join(ROOT, "catalog", categorySlug);
    const categorySkillFile = path.join(categoryPath, "skills.json");
    const categorySkills = await readJson(categorySkillFile);

    for (const item of categorySkills.skills) {
      const skillPath = path.normalize(path.join("catalog", categorySlug, item.path)).replaceAll("\\", "/");
      const normalizedSkillPath = path.normalize(path.join(ROOT, skillPath));
      const relativeSkillPath = path.relative(ROOT, normalizedSkillPath).replaceAll("\\", "/");
      const skillMdPath = path.join(normalizedSkillPath, "SKILL.md");
      const skillMd = await readFile(skillMdPath, "utf8");
      const frontmatter = parseFrontmatter(skillMd);
      const slug = item.name || frontmatter.name;

      skills.push({
        slug,
        name: item.displayName || slug,
        shortDescription: item.shortDescription || frontmatter.description || slug,
        longDescription: frontmatter.description || item.shortDescription || null,
        categorySlug,
        tagSlugs: item.tags || [],
        integrationSlugs: item.integrations || [],
        repositoryPath: relativeSkillPath,
        githubUrl: `https://github.com/${REPOSITORY}/tree/main/${relativeSkillPath}`,
        installCommand: `npx skills add ${REPOSITORY} --skill ${slug}`,
        status: item.status || "PUBLISHED",
        visibility: item.public === false ? "HIDDEN" : "PUBLIC",
        publishedAt: new Date().toISOString(),
        sourceUpdatedAt: new Date().toISOString(),
        seoTitle: `${item.displayName || slug} | Free Shopify AI Skill`,
        seoDescription: item.shortDescription || frontmatter.description || null,
        metadata: {
          sourceType: item.sourceType || "github-skill",
          tags: item.tags || [],
          integrations: item.integrations || [],
        },
        files: await collectSkillFiles(relativeSkillPath),
      });
    }
  }

  return skills;
}

const payload = {
  repository: REPOSITORY,
  commitSha: COMMIT_SHA,
  branch: BRANCH,
  generatedAt: new Date().toISOString(),
  skills: await collectSkills(),
};

console.log(JSON.stringify(payload, null, 2));
