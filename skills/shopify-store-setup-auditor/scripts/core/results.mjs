import { GROUP_WEIGHTS, MODULE_GROUPS, MODULES } from "./constants.mjs";

export function finding({ module, id, severity = "info", title, evidence, source, confidence = "medium", weight = 1, fix = null, manual = null }) {
  return { module, id, severity, title, evidence, source, confidence, weight, fix, manual };
}

export function unavailable(module, code, detail) {
  return { module, status: "unavailable", code, detail, findings: [] };
}

export function completed(module, findings = [], evidence = {}) {
  return { module, status: "complete", findings, evidence };
}

function valueForSeverity(severity) {
  if (severity === "pass") return 1;
  if (severity === "warning") return 0.5;
  if (severity === "critical") return 0;
  return null;
}

export function scoreAudit(results) {
  const grouped = new Map();
  const groupModuleCounts = new Map();
  for (const group of Object.keys(GROUP_WEIGHTS)) groupModuleCounts.set(group, Object.values(MODULE_GROUPS).filter((value) => value === group).length);
  let criticalCount = 0;
  const received = new Map(results.map((result) => [result.module, result]));
  let requiredEvidenceMissing = false;
  for (const module of MODULES) {
    const result = received.get(module);
    if (!result || result.status !== "complete" || result.evidence?.coverage === "partial" || result.findings?.some((item) => item.id === "catalog-truncated")) {
      requiredEvidenceMissing = true;
    }
  }
  for (const result of results) {
    const group = MODULE_GROUPS[result.module];
    if (!group) continue;
    if (!grouped.has(group)) grouped.set(group, []);
    if (result.status !== "complete") continue;
    const assessed = result.findings.filter((item) => valueForSeverity(item.severity) !== null);
    if (!assessed.length) continue;
    const normalizedWeight = assessed.reduce((sum, item) => sum + item.weight, 0) || 1;
    const outcome = assessed.reduce((sum, item) => sum + valueForSeverity(item.severity) * item.weight, 0) / normalizedWeight;
    grouped.get(group).push(outcome);
    criticalCount += assessed.filter((item) => item.severity === "critical").length;
  }
  const eligible = Object.values(GROUP_WEIGHTS).reduce((sum, value) => sum + value, 0);
  let evaluated = 0;
  let scorePoints = 0;
  for (const [group, weight] of Object.entries(GROUP_WEIGHTS)) {
    const outcomes = grouped.get(group) || [];
    if (!outcomes.length) continue;
    const groupOutcome = outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length;
    const coverageFraction = outcomes.length / (groupModuleCounts.get(group) || 1);
    const evaluatedGroupWeight = weight * coverageFraction;
    evaluated += evaluatedGroupWeight;
    scorePoints += groupOutcome * evaluatedGroupWeight;
  }
  const score = evaluated ? Math.round((scorePoints / evaluated) * 100) : 0;
  const evidenceCoverage = Math.round((evaluated / eligible) * 100);
  const label = criticalCount ? "Blocked" : requiredEvidenceMissing || evidenceCoverage < 75 ? "Partial evidence" : score >= 90 && evidenceCoverage >= 90 ? "Ready" : score >= 75 ? "Ready with warnings" : "Needs work";
  return { score, evidenceCoverage, criticalCount, label, evaluatedWeight: evaluated, eligibleWeight: eligible, requiredEvidenceMissing };
}
