/**
 * Git-diff validator — the pre-completion gate. GENERIC MODULE.
 *
 * Compares the working tree against a base ref (default HEAD) and enforces:
 *
 *  ERRORS (exit 1)
 *   - source files created/deleted without a validated plan (the plan is
 *     conditionally required: only structural changes — file creation or
 *     deletion — demand one; small in-place edits don't)
 *   - created/deleted source files that contradict the plan, planned
 *     files that never materialized
 *   - AgentGuard policy/config changes not declared in a plan
 *   - NEW layer-boundary or invariant violations (baseline-aware)
 *
 *  WARNINGS (exit 0)
 *   - more new files than the configured threshold
 *   - new package.json dependencies
 *   - new exported symbols similar to existing symbols elsewhere
 *   - new files whose names resemble existing files
 *   - modified source files not listed in the plan (when a plan exists)
 *
 * Warnings always carry evidence and are never made to sound certain.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { applyBaseline, checkBoundaries, loadBaseline } from "./boundaries.mjs";
import {
  AGENTGUARD_DIR,
  DEFAULT_PLAN_FILE,
  PROJECT_MAP_FILE,
  loadPathAliases,
  readJson,
  resolveImport,
} from "./config.mjs";
import { loadPlan, validatePlan } from "./plan-validator.mjs";
import { analyzeSource } from "./scan.mjs";
import { findSimilarFiles, findSimilarSymbols } from "./similarity.mjs";

export class GitError extends Error {}

const GENERATED_PREFIXES = [
  `${AGENTGUARD_DIR}/generated/`,
  `${AGENTGUARD_DIR}/cache/`,
  `${AGENTGUARD_DIR}/runs/`,
];

/** Collect working-tree changes vs base as Map(relPath → "added"|"modified"|"deleted"). */
export function collectChanges(root, base = "HEAD") {
  const git = (args) => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8" });
    } catch (error) {
      throw new GitError(`git ${args.join(" ")} failed: ${error.stderr || error.message}`);
    }
  };

  const changes = new Map();
  git(["rev-parse", "--is-inside-work-tree"]); // throws GitError when not a repo

  let headExists = true;
  try {
    execFileSync("git", ["rev-parse", "--verify", base], { cwd: root, stdio: "pipe" });
  } catch {
    headExists = false; // fresh repo with no commits: everything is "added"
  }

  if (headExists) {
    for (const line of git(["diff", "--name-status", "--no-renames", base]).split("\n")) {
      if (!line.trim()) continue;
      const [status, ...rest] = line.split("\t");
      const rel = rest.join("\t");
      if (status.startsWith("A")) changes.set(rel, "added");
      else if (status.startsWith("D")) changes.set(rel, "deleted");
      else changes.set(rel, "modified");
    }
  }
  // Untracked files never appear in `git diff` — merge them in from status.
  for (const line of git(["status", "--porcelain=v1", "-uall", "--no-renames"]).split("\n")) {
    if (line.startsWith("??")) changes.set(line.slice(3), "added");
  }
  for (const prefix of GENERATED_PREFIXES) {
    for (const key of [...changes.keys()]) if (key.startsWith(prefix)) changes.delete(key);
  }
  return changes;
}

export function validateDiff(root, config, { base = "HEAD", planPath = DEFAULT_PLAN_FILE } = {}) {
  const errors = [];
  const warnings = [];
  const map = readJson(path.join(root, PROJECT_MAP_FILE));
  if (!map) {
    errors.push(`Missing ${PROJECT_MAP_FILE} — run the scan first (npm run agent:scan).`);
    return { errors, warnings, changes: new Map() };
  }

  const changes = collectChanges(root, base);
  const isSource = (rel) =>
    config.project.sourceRoots.some((r) => rel === r || rel.startsWith(r.replace(/\/$/, "") + "/")) &&
    config.scan.includeExtensions.includes(path.posix.extname(rel));

  const added = [...changes.entries()].filter(([, s]) => s === "added").map(([p]) => p);
  const deleted = [...changes.entries()].filter(([, s]) => s === "deleted").map(([p]) => p);
  const modified = [...changes.entries()].filter(([, s]) => s === "modified").map(([p]) => p);
  const addedSource = added.filter(isSource);
  const deletedSource = deleted.filter(isSource);
  const modifiedSource = modified.filter(isSource);

  // ---- plan requirement + plan/diff matching -------------------------------
  const planExists = fs.existsSync(path.isAbsolute(planPath) ? planPath : path.join(root, planPath));
  const planRequired = addedSource.length > 0 || deletedSource.length > 0;
  let plan = null;

  if (planExists) {
    const loaded = loadPlan(root, planPath);
    if (loaded.errors.length) errors.push(...loaded.errors);
    else {
      const result = validatePlan(root, loaded.plan, { postImplementation: true });
      if (result.errors.length) {
        errors.push(`Plan ${planPath} is invalid:`, ...result.errors.map((e) => `  ${e}`));
      } else {
        plan = loaded.plan;
        warnings.push(...result.warnings);
      }
    }
  } else if (planRequired) {
    errors.push(
      `This diff creates/deletes source files (${[...addedSource, ...deletedSource].join(", ")}) but no implementation plan exists at ${planPath}. ` +
        `Structural changes require a validated plan — see .agentguard/README.md.`,
    );
  }

  const planPaths = (field) => new Set((plan?.[field] ?? []).map((e) => (typeof e === "string" ? e : e.path)));
  if (plan) {
    const planned = { create: planPaths("filesToCreate"), delete: planPaths("filesToDelete"), modify: planPaths("filesToModify") };
    for (const p of addedSource) {
      if (!planned.create.has(p)) errors.push(`New file "${p}" is not in the plan's filesToCreate. Add it with a justification, or fold the change into an existing file.`);
    }
    for (const p of deletedSource) {
      if (!planned.delete.has(p)) errors.push(`Deleted file "${p}" is not in the plan's filesToDelete.`);
    }
    for (const p of planned.create) {
      if (!changes.has(p)) errors.push(`Planned new file "${p}" was never created (or is unchanged).`);
    }
    for (const p of planned.delete) {
      if (fs.existsSync(path.join(root, p))) errors.push(`Planned deletion "${p}" still exists.`);
    }
    for (const p of modifiedSource) {
      if (!planned.modify.has(p) && !planned.create.has(p)) {
        warnings.push(`Modified "${p}" is not listed in the plan's filesToModify — confirm the change belongs to this task.`);
      }
    }
  }

  // ---- protected policy files ----------------------------------------------
  const policyFile = (rel) =>
    (rel.startsWith(`${AGENTGUARD_DIR}/`) || rel === "AGENTS.md" || rel === "CLAUDE.md") &&
    !GENERATED_PREFIXES.some((p) => rel.startsWith(p));
  for (const rel of [...added, ...deleted, ...modified].filter(policyFile)) {
    const inPlan = plan && ["filesToModify", "filesToCreate", "filesToDelete"].some((f) => planPaths(f).has(rel));
    if (!inPlan) {
      errors.push(`"${rel}" is an AgentGuard policy/config artifact. Changing it must be an explicit, planned act — list it in the implementation plan.`);
    }
  }

  // ---- boundary + invariant checks on changed files (baseline-aware) -------
  const aliases = loadPathAliases(root);
  const changedOnDisk = [...addedSource, ...modifiedSource].filter((p) => fs.existsSync(path.join(root, p)));
  const freshEntries = changedOnDisk.map((rel) => {
    const analysis = analyzeSource(rel, fs.readFileSync(path.join(root, rel), "utf8"));
    const locals = [];
    const packages = [];
    for (const spec of analysis.imports) {
      const resolved = resolveImport(spec, rel, aliases);
      if (resolved) locals.push(resolved);
      else packages.push(spec);
    }
    return { path: rel, ...analysis, imports: packages, localImports: locals };
  });
  const boundaryViolations = checkBoundaries(root, config, { files: freshEntries }, {});
  const { errors: newViolations, warnings: baselined } = applyBaseline(boundaryViolations, loadBaseline(root));
  for (const v of newViolations) {
    errors.push(`[${v.ruleId}] ${v.file}${v.line ? `:${v.line}` : ""} — ${v.message} (${v.evidence})`);
  }
  for (const v of baselined) {
    warnings.push(`[${v.ruleId}${v.baselined ? ", baselined" : ""}] ${v.file}${v.line ? `:${v.line}` : ""} — ${v.message} (${v.evidence})`);
  }

  // ---- heuristic warnings ---------------------------------------------------
  if (addedSource.length > config.validation.newFileCountWarningThreshold) {
    warnings.push(
      `${addedSource.length} new source files (threshold ${config.validation.newFileCountWarningThreshold}). ` +
        `Many new files on one task often signals speculative structure — check each is truly needed.`,
    );
  }

  warnings.push(...dependencyWarnings(root, base, changes));

  const threshold = config.validation.similarityThreshold;
  const newSymbols = collectNewExports(root, base, freshEntries, changes);
  const mapSymbols = map.symbols.filter((s) => !changes.has(s.file));
  for (const f of findSimilarSymbols(newSymbols, mapSymbols, threshold).slice(0, 20)) {
    warnings.push(
      `New export "${f.name}" (${f.file}) is similar to existing "${f.existingName}" (${f.existingFile}, score ${f.score}). ` +
        `Inspect the existing one — extend it instead if it covers this responsibility.`,
    );
  }
  const existingPaths = map.files.map((f) => f.path).filter((p) => !changes.has(p));
  for (const f of findSimilarFiles(addedSource, existingPaths, threshold).slice(0, 10)) {
    warnings.push(
      `New file "${f.file}" resembles existing "${f.existingFile}" (score ${f.score}). Confirm it is not a parallel implementation.`,
    );
  }

  return { errors, warnings, changes };
}

function dependencyWarnings(root, base, changes) {
  if (!changes.has("package.json")) return [];
  let oldPkg;
  try {
    oldPkg = JSON.parse(execFileSync("git", ["show", `${base}:package.json`], { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
  } catch {
    return [];
  }
  const current = readJson(path.join(root, "package.json")) ?? {};
  const warnings = [];
  for (const field of ["dependencies", "devDependencies"]) {
    const before = new Set(Object.keys(oldPkg?.[field] ?? {}));
    for (const name of Object.keys(current[field] ?? {})) {
      if (!before.has(name)) {
        warnings.push(
          `New ${field === "dependencies" ? "runtime" : "development"} dependency "${name}". ` +
            `Prefer an existing dependency or a small local implementation unless it materially simplifies the task.`,
        );
      }
    }
  }
  return warnings;
}

/** Exports present now but absent at `base` (per-file, parsed both sides). */
function collectNewExports(root, base, freshEntries, changes) {
  const newSymbols = [];
  for (const entry of freshEntries) {
    let oldNames = new Set();
    if (changes.get(entry.path) === "modified") {
      try {
        const oldContent = execFileSync("git", ["show", `${base}:${entry.path}`], { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        oldNames = new Set(analyzeSource(entry.path, oldContent).exports.map((e) => e.name));
      } catch {
        continue;
      }
    }
    for (const exp of entry.exports) {
      if (!oldNames.has(exp.name)) newSymbols.push({ name: exp.name, file: entry.path });
    }
  }
  return newSymbols;
}
