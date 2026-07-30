/**
 * Implementation-plan validator. GENERIC MODULE.
 *
 * Structural, deterministic checks over the plan JSON described by
 * `.agentguard/schemas/implementation-plan.schema.json`. The checks here are
 * the executable subset of that schema plus filesystem/path sanity; the
 * schema file itself exists for editor tooling.
 *
 * Errors are objective violations (exit 1 territory). This module never
 * judges the QUALITY of a plan — that is the reviewer role's job.
 */
import fs from "node:fs";
import path from "node:path";

const DECISIONS = new Set(["reuse", "extend", "consolidate", "replace", "unrelated"]);
const LIST_FIELDS = ["existingCode", "filesToModify", "filesToCreate", "filesToDelete", "newDependencies", "newAbstractions"];

export function loadPlan(root, planPath) {
  const abs = path.isAbsolute(planPath) ? planPath : path.join(root, planPath);
  if (!fs.existsSync(abs)) return { plan: null, errors: [`Plan file not found: ${planPath}`] };
  try {
    return { plan: JSON.parse(fs.readFileSync(abs, "utf8")), errors: [] };
  } catch (error) {
    return { plan: null, errors: [`Plan is not valid JSON: ${error.message}`] };
  }
}

/**
 * `postImplementation: true` relaxes the on-disk existence checks that only
 * make sense BEFORE the work happens (planned deletions are already gone by
 * the time the diff validator re-validates the plan).
 */
export function validatePlan(root, plan, { postImplementation = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);

  if (plan.schemaVersion !== 1) err(`schemaVersion must be 1 (got ${JSON.stringify(plan.schemaVersion)}).`);
  if (!nonEmptyString(plan.task)) err(`"task" must be a non-empty string.`);
  if (!nonEmptyString(plan.summary)) err(`"summary" must be a non-empty string.`);
  for (const field of LIST_FIELDS) {
    if (plan[field] !== undefined && !Array.isArray(plan[field])) err(`"${field}" must be an array.`);
  }
  if (!Array.isArray(plan.validationCommands) || plan.validationCommands.length === 0) {
    err(`"validationCommands" must list at least one command (e.g. the repo lint/build).`);
  }

  const existingCode = arr(plan.existingCode);
  if (existingCode.length === 0 && !nonEmptyString(plan.noExistingCodeExplanation)) {
    err(
      `"existingCode" is empty. Either list the related code discovery found (with reuse/extend decisions), ` +
        `or set "noExistingCodeExplanation" stating explicitly that discovery found no relevant implementation.`,
    );
  }
  for (const entry of existingCode) {
    if (!nonEmptyString(entry.path)) err(`existingCode entry missing "path".`);
    if (!nonEmptyString(entry.relevance)) err(`existingCode "${entry.path}": missing "relevance".`);
    if (!DECISIONS.has(entry.decision)) {
      err(`existingCode "${entry.path}": "decision" must be one of ${[...DECISIONS].join(", ")}.`);
    }
  }

  const modify = pathsOf(plan.filesToModify);
  const create = pathsOf(plan.filesToCreate);
  const del = pathsOf(plan.filesToDelete);

  for (const [field, entries] of [["filesToModify", plan.filesToModify], ["filesToCreate", plan.filesToCreate], ["filesToDelete", plan.filesToDelete]]) {
    for (const entry of arr(entries)) {
      const p = entryPath(entry);
      if (!nonEmptyString(p)) {
        err(`${field} entry missing "path".`);
        continue;
      }
      if (path.isAbsolute(p) || p.split("/").includes("..")) err(`${field} "${p}": paths must be repo-relative without "..".`);
      if (field === "filesToCreate" && !nonEmptyString(entry.reason)) {
        err(`filesToCreate "${p}": every new file needs a non-empty "reason" explaining why no existing file is suitable.`);
      }
    }
  }

  const all = [...modify, ...create, ...del];
  for (const dup of duplicates(all)) err(`"${dup}" appears in more than one change list (or twice in one).`);

  for (const p of modify) {
    if (!fs.existsSync(path.join(root, p))) err(`filesToModify "${p}" does not exist.`);
  }
  for (const p of del) {
    if (!postImplementation && !fs.existsSync(path.join(root, p))) err(`filesToDelete "${p}" does not exist.`);
  }
  // filesToCreate may already exist on disk when the plan is re-validated
  // after implementation (the diff validator does this) — not an error.

  for (const abstraction of arr(plan.newAbstractions)) {
    for (const field of ["name", "presentRequirement", "alternativesConsidered", "consumers"]) {
      if (!nonEmptyString(abstraction[field]) && !Array.isArray(abstraction[field])) {
        err(`newAbstractions "${abstraction.name ?? "?"}": missing "${field}" — a new abstraction needs a present need, considered alternatives, and current consumers.`);
      }
    }
  }
  for (const dep of arr(plan.newDependencies)) {
    const name = typeof dep === "string" ? dep : dep?.name;
    if (!nonEmptyString(name)) err(`newDependencies entries must be package names or { name, reason }.`);
    else if (typeof dep !== "string" && !nonEmptyString(dep.reason)) warnings.push(`New dependency "${name}" has no reason — justify it or use an existing dependency.`);
  }

  return { errors, warnings };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const nonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const entryPath = (entry) => (typeof entry === "string" ? entry : entry?.path);
const pathsOf = (entries) => arr(entries).map(entryPath).filter(Boolean);

function duplicates(list) {
  const seen = new Set();
  const dups = new Set();
  for (const item of list) (seen.has(item) ? dups : seen).add(item);
  return [...dups];
}
