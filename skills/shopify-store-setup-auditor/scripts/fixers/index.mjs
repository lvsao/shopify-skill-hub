import { executeAction, requiredAccessScopes } from "./actions.mjs";
import { checkSnapshot } from "./probes.mjs";

function writeReceipt(data) {
  return { responseRoots: Object.keys(data || {}).filter((key) => key !== "themeJob"), themeJob: data?.themeJob || null };
}

function matchesExpected(current, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(current)) return false;
    return expected.every((value, index) => value && typeof value === "object" && value.id ? current.some((candidate) => matchesExpected(candidate, value)) : matchesExpected(current[index], value));
  }
  if (expected && typeof expected === "object") {
    return current && typeof current === "object" && Object.entries(expected).every(([key, value]) => matchesExpected(current[key], value));
  }
  return current === expected;
}

function isPostWriteVerified(change, snapshot) {
  if (change.type === "redirect_delete") return snapshot.code === "RESOURCE_NOT_FOUND";
  if (snapshot.code !== "STALE_SNAPSHOT" || !snapshot.current) return false;
  if (change.type === "theme_files_upsert") {
    return Object.entries(change.before.files || {}).every(([filename, checksum]) => snapshot.current.files?.[filename] && snapshot.current.files[filename] !== checksum);
  }
  return matchesExpected(snapshot.current, change.expected);
}

export async function previewChanges(config, changes) {
  const results = [];
  for (const change of changes) {
    const snapshot = await checkSnapshot(config, change);
    results.push({ id: change.id, type: change.type, resource: change.resource || null, ...snapshot });
  }
  return results;
}

export async function executeChanges(config, changes) {
  const preview = await previewChanges(config, changes);
  const stale = preview.filter((item) => !item.ok);
  const requiredScopes = requiredAccessScopes(changes);
  if (stale.length) return { executed: [], preview, blocked: stale, requiredScopes };
  const executed = [];
  for (const change of changes) {
    try {
      const data = await executeAction(config, change);
      const verification = await checkSnapshot(config, change);
      executed.push({ id: change.id, type: change.type, ok: isPostWriteVerified(change, verification), verification, receipt: writeReceipt(data) });
    }
    catch (error) {
      const accessDenied = /ACCESS_DENIED|SCOPE/i.test(String(error?.code || ""));
      executed.push({ id: change.id, type: change.type, ok: false, code: accessDenied ? "SCOPE_UPDATE_REQUIRED" : error.code || "WRITE_FAILED", requiredScopes: accessDenied ? requiredAccessScopes([change]) : undefined, detail: String(error?.message || error) });
    }
  }
  return { executed, preview, blocked: [], requiredScopes };
}

export async function verifyChanges(config, changes) {
  const verified = [];
  for (const change of changes) {
    const snapshot = await checkSnapshot(config, change);
    verified.push({ id: change.id, type: change.type, verified: isPostWriteVerified(change, snapshot), detail: snapshot });
  }
  return verified;
}
