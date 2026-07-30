/**
 * AgentGuard configuration + shared path utilities.
 *
 * GENERIC MODULE — must contain no knowledge of this specific project.
 * Everything project-specific (roots, layer rules, invariants) lives in
 * `.agentguard/config.json`. Keep it that way: it is what makes the whole
 * toolkit copy-pasteable into the next project.
 */
import fs from "node:fs";
import path from "node:path";

export const AGENTGUARD_DIR = ".agentguard";
export const CONFIG_FILE = path.join(AGENTGUARD_DIR, "config.json");
export const PROJECT_MAP_FILE = path.join(AGENTGUARD_DIR, "generated", "project-map.json");
export const TASK_CONTEXT_FILE = path.join(AGENTGUARD_DIR, "generated", "task-context.json");
export const CACHE_FILE = path.join(AGENTGUARD_DIR, "cache", "file-index.json");
export const BASELINE_FILE = path.join(AGENTGUARD_DIR, "baseline.json");
export const DEFAULT_PLAN_FILE = path.join(AGENTGUARD_DIR, "runs", "current-plan.json");

export class ConfigError extends Error {}

const CONFIG_DEFAULTS = {
  scan: {
    includeExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    exclude: ["node_modules", ".next", ".git", "coverage", "build", "out", AGENTGUARD_DIR],
    maxFileSizeBytes: 500_000,
  },
  validation: { newFileCountWarningThreshold: 3, similarityThreshold: 0.65 },
  context: { maximumCandidates: 20, maximumSymbolsPerFile: 50 },
};

/** Returns the repo root (cwd) if it contains an AgentGuard config, else null. */
export function findRoot(cwd = process.cwd()) {
  return fs.existsSync(path.join(cwd, CONFIG_FILE)) ? cwd : null;
}

export function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

export function loadConfig(root) {
  let raw;
  try {
    raw = readJson(path.join(root, CONFIG_FILE));
  } catch (error) {
    throw new ConfigError(`${CONFIG_FILE} is not valid JSON: ${error.message}`);
  }
  if (!raw) throw new ConfigError(`${CONFIG_FILE} not found — run AgentGuard from the repository root.`);
  if (raw.version !== 1) throw new ConfigError(`Unsupported config version "${raw.version}" (expected 1).`);
  if (!Array.isArray(raw.project?.sourceRoots) || raw.project.sourceRoots.length === 0) {
    throw new ConfigError("config.project.sourceRoots must be a non-empty array.");
  }

  const config = {
    ...raw,
    scan: { ...CONFIG_DEFAULTS.scan, ...raw.scan },
    validation: { ...CONFIG_DEFAULTS.validation, ...raw.validation },
    context: { ...CONFIG_DEFAULTS.context, ...raw.context },
    boundaries: { importRules: [], invariants: [], ...raw.boundaries },
    integrations: raw.integrations ?? {},
  };

  for (const rule of config.boundaries.importRules) {
    if (!rule.id || !Array.isArray(rule.targets)) {
      throw new ConfigError(`Import rule ${JSON.stringify(rule.id)} needs "id" and "targets".`);
    }
    if (!rule.allowedImporters && !rule.deniedImporters) {
      throw new ConfigError(`Import rule "${rule.id}" needs "allowedImporters" or "deniedImporters".`);
    }
  }
  for (const rule of config.boundaries.invariants) {
    if (!rule.id || !rule.pattern || !Array.isArray(rule.paths)) {
      throw new ConfigError(`Invariant ${JSON.stringify(rule.id)} needs "id", "pattern" and "paths".`);
    }
    try {
      compileInvariantPattern(rule);
    } catch (error) {
      throw new ConfigError(`Invariant "${rule.id}" has an invalid pattern: ${error.message}`);
    }
  }
  return config;
}

export function compileInvariantPattern(rule) {
  const flags = rule.flags ?? "";
  return new RegExp(rule.pattern, flags.includes("g") ? flags : flags + "g");
}

/** True when the rule belongs to an integration that is disabled in config. */
export function ruleDisabled(rule, config) {
  if (!rule.integration) return false;
  return config.integrations?.[rule.integration]?.enabled === false;
}

/**
 * Minimal glob → RegExp for repo-relative posix paths.
 *   `**` matches across segments, `*` within one segment.
 *   A trailing `/**` also matches the bare prefix itself, so
 *   `lib/cms/contentful/**` matches both the barrel import
 *   `lib/cms/contentful` and `lib/cms/contentful/client.ts`.
 */
export function globToRegExp(glob) {
  let g = glob.replace(/^\.\//, "").replace(/\/+$/, "");
  let optionalTail = false;
  if (g.endsWith("/**")) {
    g = g.slice(0, -3);
    optionalTail = true;
  }
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*") {
      if (g[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(ch)) {
      re += "\\" + ch;
    } else {
      re += ch;
    }
  }
  if (optionalTail) re += "(/.*)?";
  return new RegExp(`^${re}$`);
}

export function matchesAny(relPath, globs) {
  return (globs ?? []).some((g) => globToRegExp(g).test(relPath));
}

/** Load path aliases from tsconfig/jsconfig `compilerOptions.paths`. */
export function loadPathAliases(root) {
  const aliases = [];
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    let parsed;
    try {
      const text = fs.readFileSync(path.join(root, name), "utf8");
      parsed = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
    } catch {
      continue;
    }
    const paths = parsed?.compilerOptions?.paths ?? {};
    const baseUrl = parsed?.compilerOptions?.baseUrl ?? ".";
    for (const [pattern, targets] of Object.entries(paths)) {
      if (!pattern.endsWith("*") || !targets?.[0]?.endsWith("*")) continue;
      aliases.push({
        prefix: pattern.slice(0, -1),
        target: path.posix.normalize(path.posix.join(baseUrl, targets[0].slice(0, -1))),
      });
    }
    break;
  }
  return aliases;
}

/**
 * Resolve an import specifier to a repo-relative, extensionless module path.
 * Returns null for package imports. No filesystem lookup: boundary globs
 * match the normalized module path (e.g. `lib/cms/contentful/client`).
 */
export function resolveImport(specifier, importerRelPath, aliases) {
  if (specifier.startsWith(".")) {
    const dir = path.posix.dirname(importerRelPath.split(path.sep).join("/"));
    return normalizeModulePath(path.posix.join(dir, specifier));
  }
  for (const { prefix, target } of aliases) {
    if (specifier.startsWith(prefix)) {
      return normalizeModulePath(path.posix.join(target, specifier.slice(prefix.length)));
    }
  }
  return null;
}

function normalizeModulePath(p) {
  return path.posix
    .normalize(p)
    .replace(/^\.\//, "")
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
}

/** Detect the package manager from lockfiles. */
export function detectPackageManager(root) {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lockb")) || fs.existsSync(path.join(root, "bun.lock"))) return "bun";
  return "npm";
}
