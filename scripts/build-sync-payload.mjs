#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const ROOT = process.cwd();
const REPOSITORY = process.env.GITHUB_REPOSITORY || "lvsao/shopify-skill-hub";
const COMMIT_SHA = process.env.GITHUB_SHA || null;
const BRANCH = process.env.GITHUB_REF_NAME || "main";
const GENERATED_AT = new Date().toISOString();
const execFileAsync = promisify(execFile);

const PUBLIC_FILE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".mjs",
  ".js",
  ".ts",
  ".tsx",
  ".py",
  ".json",
  ".yaml",
  ".yml",
  ".txt",
  ".toml",
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

function isLocalizedText(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.en === "string" &&
    value.en.trim().length > 0 &&
    typeof value.zh === "string" &&
    value.zh.trim().length > 0
  );
}

function assertLocalizedText(value, pathLabel) {
  if (!isLocalizedText(value)) {
    throw new Error(`${pathLabel} must include non-empty en and zh strings.`);
  }
}

function textForLocale(value, locale) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isLocalizedText(value)) return value[locale].trim();
  return null;
}

function textFallback(value, fallback) {
  return textForLocale(value, "en") || fallback;
}

function normalizeFeatures(features = [], skillName) {
  if (!Array.isArray(features)) {
    throw new Error(`${skillName}.features must be an array.`);
  }

  return features.map((feature, index) => {
    const pathLabel = `${skillName}.features[${index}]`;
    if (!feature || typeof feature !== "object" || Array.isArray(feature)) {
      throw new Error(`${pathLabel} must be an object.`);
    }
    if (typeof feature.id !== "string" || !feature.id.trim()) {
      throw new Error(`${pathLabel}.id must be a non-empty string.`);
    }
    assertLocalizedText(feature.title, `${pathLabel}.title`);
    assertLocalizedText(feature.description, `${pathLabel}.description`);
    assertLocalizedText(feature.badge, `${pathLabel}.badge`);

    return {
      id: feature.id.trim(),
      title: feature.title,
      description: feature.description,
      badge: feature.badge,
      icon: typeof feature.icon === "string" && feature.icon.trim() ? feature.icon.trim() : "Sparkles",
    };
  });
}

function normalizePrerequisites(prerequisites = [], skillName) {
  if (!Array.isArray(prerequisites)) {
    throw new Error(`${skillName}.prerequisites must be an array.`);
  }

  return prerequisites.map((prerequisite, index) => {
    const pathLabel = `${skillName}.prerequisites[${index}]`;
    if (!prerequisite || typeof prerequisite !== "object" || Array.isArray(prerequisite)) {
      throw new Error(`${pathLabel} must be an object.`);
    }
    if (typeof prerequisite.id !== "string" || !prerequisite.id.trim()) {
      throw new Error(`${pathLabel}.id must be a non-empty string.`);
    }
    assertLocalizedText(prerequisite.label, `${pathLabel}.label`);
    assertLocalizedText(prerequisite.badge, `${pathLabel}.badge`);

    return {
      id: prerequisite.id.trim(),
      label: prerequisite.label,
      badge: prerequisite.badge,
      icon:
        typeof prerequisite.icon === "string" && prerequisite.icon.trim()
          ? prerequisite.icon.trim()
          : "Sparkles",
    };
  });
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

function stableJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function normalizeSkillFilePath(filePath, skill) {
  const normalizedPath = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const repositoryPath = skill.repositoryPath?.replaceAll("\\", "/").replace(/^\/+/, "");
  const repositoryPrefix = repositoryPath ? `${repositoryPath}/` : null;
  const slugPrefix = `${skill.slug}/`;
  const skillsPrefix = `skills/${skill.slug}/`;

  if (repositoryPrefix && normalizedPath.startsWith(repositoryPrefix)) {
    return normalizedPath.slice(repositoryPrefix.length);
  }

  if (normalizedPath.startsWith(skillsPrefix)) {
    return normalizedPath.slice(skillsPrefix.length);
  }

  if (normalizedPath.startsWith(slugPrefix)) {
    return normalizedPath.slice(slugPrefix.length);
  }

  return normalizedPath;
}

function buildSourceFingerprint(skill) {
  const fingerprintInput = {
    slug: skill.slug,
    name: skill.name,
    shortDescription: skill.shortDescription,
    longDescription: skill.longDescription ?? null,
    categorySlug: skill.categorySlug,
    tagSlugs: [...skill.tagSlugs].sort(),
    integrationSlugs: [...skill.integrationSlugs].sort(),
    repositoryPath: skill.repositoryPath ?? null,
    githubUrl: skill.githubUrl ?? null,
    installCommand: skill.installCommand ?? null,
    status: skill.status,
    visibility: skill.visibility,
    seoTitle: skill.seoTitle ?? null,
    seoDescription: skill.seoDescription ?? null,
    metadata: skill.metadata ?? null,
    files: [...skill.files]
      .map((file) => ({
        path: normalizeSkillFilePath(file.path, skill),
        language: file.language ?? null,
        content: file.content,
        size: file.size ?? file.content.length,
        sha: file.sha ?? null,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };

  return sha(stableJson(fingerprintInput));
}

async function getLatestGitCommitIso(paths) {
  try {
    const { stdout } = await execFileAsync("git", [
      "log",
      "-1",
      "--format=%cI",
      "--",
      ...paths,
    ], {
      cwd: ROOT,
      windowsHide: true,
    });
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

function languageFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".md" || extension === ".mdx") return "markdown";
  if (extension === ".ts") return "typescript";
  if (extension === ".tsx") return "tsx";
  if (extension === ".mjs" || extension === ".js") return "javascript";
  if (extension === ".py") return "python";
  if (extension === ".json") return "json";
  if (extension === ".yaml" || extension === ".yml") return "yaml";
  if (extension === ".toml") return "toml";
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
      const categorySkillPath = path.relative(ROOT, categorySkillFile).replaceAll("\\", "/");
      const normalizedSkillPath = path.normalize(path.join(ROOT, skillPath));
      const relativeSkillPath = path.relative(ROOT, normalizedSkillPath).replaceAll("\\", "/");
      const skillMdPath = path.join(normalizedSkillPath, "SKILL.md");
      const skillMd = await readFile(skillMdPath, "utf8");
      const frontmatter = parseFrontmatter(skillMd);
      const slug = item.name || frontmatter.name;
      const features = normalizeFeatures(item.features, slug);
      const prerequisites = normalizePrerequisites(item.prerequisites, slug);

      if (item.introduction !== undefined) {
        assertLocalizedText(item.introduction, `${slug}.introduction`);
      }
      if (item.shortDescription !== undefined && typeof item.shortDescription !== "string") {
        assertLocalizedText(item.shortDescription, `${slug}.shortDescription`);
      }
      if (item.longDescription !== undefined && typeof item.longDescription !== "string") {
        assertLocalizedText(item.longDescription, `${slug}.longDescription`);
      }

      const shortDescription = textFallback(item.shortDescription, frontmatter.description || slug);
      const longDescription =
        textFallback(item.longDescription, textForLocale(item.introduction, "en") || frontmatter.description || shortDescription);
      const sourceUpdatedAt =
        (await getLatestGitCommitIso([relativeSkillPath, categorySkillPath])) || GENERATED_AT;
      const skill = {
        slug,
        name: item.displayName || slug,
        shortDescription,
        longDescription,
        categorySlug,
        tagSlugs: item.tags || [],
        integrationSlugs: item.integrations || [],
        repositoryPath: relativeSkillPath,
        githubUrl: `https://github.com/${REPOSITORY}/tree/main/${relativeSkillPath}`,
        installCommand: `npx --yes skills add ${REPOSITORY} --skill ${slug}`,
        status: item.status || "PUBLISHED",
        visibility: item.public === false ? "HIDDEN" : "PUBLIC",
        publishedAt: sourceUpdatedAt,
        sourceUpdatedAt,
        seoTitle: `${item.displayName || slug} | Free Shopify AI Skill`,
        seoDescription: shortDescription,
        metadata: {
          sourceType: item.sourceType || "github-skill",
          shortDescription: item.shortDescription || null,
          longDescription: item.longDescription || null,
          introduction: item.introduction || null,
          features,
          prerequisites,
          tags: item.tags || [],
          integrations: item.integrations || [],
        },
        files: await collectSkillFiles(relativeSkillPath),
      };

      skills.push({
        ...skill,
        sourceFingerprint: buildSourceFingerprint(skill),
      });
    }
  }

  return skills;
}

const payload = {
  repository: REPOSITORY,
  commitSha: COMMIT_SHA,
  branch: BRANCH,
  generatedAt: GENERATED_AT,
  skills: await collectSkills(),
};

console.log(JSON.stringify(payload, null, 2));
