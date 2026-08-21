import { MODULES } from "./constants.mjs";

export function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) { args._.push(value); continue; }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

export function normalizeLanguage(value, fallback = "en") {
  if (value === "zh-CN") return "zh-CN";
  if (value === "en") return "en";
  if (value === "auto") return fallback;
  return fallback;
}

export function selectedModules(value) {
  if (!value || value === "all") return [...MODULES];
  const names = String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
  const invalid = names.filter((entry) => !MODULES.includes(entry));
  if (invalid.length) throw new Error(`INVALID_MODULES: ${invalid.join(", ")}`);
  return [...new Set(names)];
}

export function requiredArg(args, name) {
  const value = String(args[name] || "").trim();
  if (!value) throw new Error(`MISSING_${name.toUpperCase().replace(/-/g, "_")}`);
  return value;
}
