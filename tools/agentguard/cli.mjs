#!/usr/bin/env node
/**
 * AgentGuard CLI. GENERIC MODULE — all project specifics live in
 * `.agentguard/config.json`.
 *
 * Exit codes: 0 ok (warnings allowed) · 1 validation errors · 2 bad
 * usage/config · 3 git or repository state prevents validation.
 * Local-only: no command reads the network or modifies application source.
 */
import path from "node:path";
import { applyBaseline, checkBoundaries, loadBaseline, writeBaseline } from "./boundaries.mjs";
import {
  ConfigError,
  DEFAULT_PLAN_FILE,
  PROJECT_MAP_FILE,
  TASK_CONTEXT_FILE,
  findRoot,
  loadConfig,
  readJson,
} from "./config.mjs";
import { GitError, validateDiff } from "./diff-validator.mjs";
import { discover } from "./discover.mjs";
import { loadPlan, validatePlan } from "./plan-validator.mjs";
import { scan } from "./scan.mjs";

const HELP = `AgentGuard — repository-owned governance for AI coding agents (local, deterministic).

Usage: node tools/agentguard/cli.mjs <command> [args]

Commands:
  scan                        Rebuild ${PROJECT_MAP_FILE} (incremental, cached)
  discover "<task>"           Rank related files into ${TASK_CONTEXT_FILE}
  validate-plan [plan.json]   Validate an implementation plan (default: ${DEFAULT_PLAN_FILE})
  validate-diff [--base REF] [--plan plan.json]
                              Validate working-tree changes against the plan,
                              layer boundaries, and invariants (base: HEAD)
  boundaries [--update-baseline]
                              Check the whole repo's import rules + invariants;
                              --update-baseline accepts current violations
  check [--base REF]          scan + boundaries + validate-diff
  help                        Show this help

Run from the repository root (the directory containing .agentguard/).`;

const log = (msg = "") => console.log(msg);
const printErrors = (errors) => errors.forEach((e) => console.error(`  ERROR ${e}`));
const printWarnings = (warnings) => warnings.forEach((w) => console.warn(`  WARN  ${w}`));

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    log(HELP);
    return 0;
  }

  const root = findRoot();
  if (!root) {
    console.error(`ERROR .agentguard/config.json not found in ${process.cwd()} — run from the repository root.`);
    return 2;
  }
  let config;
  try {
    config = loadConfig(root);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(`ERROR ${error.message}`);
    return 2;
  }

  switch (command) {
    case "scan":
      return runScan(root, config);
    case "discover":
      return runDiscover(root, config, args);
    case "validate-plan":
      return runValidatePlan(root, args);
    case "validate-diff":
      return runValidateDiff(root, config, args);
    case "boundaries":
      return runBoundaries(root, config, args);
    case "check":
      return runCheck(root, config, args);
    default:
      console.error(`ERROR Unknown command "${command}".\n`);
      log(HELP);
      return 2;
  }
}

function runScan(root, config) {
  const { map, stats } = scan(root, config);
  log(
    `Scanned ${stats.total} files (${stats.parsed} parsed, ${stats.reusedStat + stats.reusedHash} from cache) → ` +
      `${map.files.length} files, ${map.symbols.length} symbols in ${PROJECT_MAP_FILE}`,
  );
  return 0;
}

function runDiscover(root, config, args) {
  const task = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!task) {
    console.error(`ERROR discover needs a task description, e.g.\n  npm run agent:discover -- "Add preview support for content pages"`);
    return 2;
  }
  const map = readJson(path.join(root, PROJECT_MAP_FILE));
  if (!map) {
    console.error(`ERROR ${PROJECT_MAP_FILE} missing — run agent:scan first.`);
    return 1;
  }
  const context = discover(root, config, map, task);
  log(`Task: ${task}`);
  log(`Top candidates (${context.candidates.length}) → ${TASK_CONTEXT_FILE}`);
  for (const c of context.candidates.slice(0, 10)) {
    log(`  ${String(c.score).padEnd(4)} ${c.path}`);
    log(`       ${c.reasons.slice(0, 3).join("; ")}`);
  }
  printWarnings(context.warnings);
  log(`\nInspect the referenced source files — the context is a guide, the code is the source of truth.`);
  return 0;
}

function runValidatePlan(root, args) {
  const planPath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_PLAN_FILE;
  const { plan, errors: loadErrors } = loadPlan(root, planPath);
  if (loadErrors.length) {
    printErrors(loadErrors);
    return 1;
  }
  const { errors, warnings } = validatePlan(root, plan);
  printErrors(errors);
  printWarnings(warnings);
  if (errors.length) {
    log(`\nPlan INVALID (${errors.length} error${errors.length === 1 ? "" : "s"}).`);
    return 1;
  }
  log(`Plan valid: ${planPath}${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}`);
  return 0;
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function runValidateDiff(root, config, args) {
  let result;
  try {
    result = validateDiff(root, config, {
      base: flagValue(args, "--base") ?? "HEAD",
      planPath: flagValue(args, "--plan") ?? DEFAULT_PLAN_FILE,
    });
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    console.error(`ERROR ${error.message}`);
    return 3;
  }
  const { errors, warnings, changes } = result;
  log(`Diff: ${changes.size} changed file${changes.size === 1 ? "" : "s"} vs ${flagValue(args, "--base") ?? "HEAD"}`);
  printErrors(errors);
  printWarnings(warnings);
  if (errors.length) {
    log(`\nDiff validation FAILED (${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warnings).`);
    return 1;
  }
  log(`\nDiff validation passed${warnings.length ? ` with ${warnings.length} warning${warnings.length === 1 ? "" : "s"} — resolve or justify each in your summary` : ""}.`);
  return 0;
}

function runBoundaries(root, config, args) {
  const map = readJson(path.join(root, PROJECT_MAP_FILE));
  if (!map) {
    console.error(`ERROR ${PROJECT_MAP_FILE} missing — run agent:scan first.`);
    return 1;
  }
  const violations = checkBoundaries(root, config, map, {});
  if (args.includes("--update-baseline")) {
    const entries = writeBaseline(root, violations);
    log(`Baseline updated: ${entries.length} accepted violation${entries.length === 1 ? "" : "s"} recorded in .agentguard/baseline.json`);
    return 0;
  }
  const { errors, warnings } = applyBaseline(violations, loadBaseline(root));
  printErrors(errors.map((v) => `[${v.ruleId}] ${v.file}${v.line ? `:${v.line}` : ""} — ${v.message} (${v.evidence})`));
  printWarnings(warnings.map((v) => `[${v.ruleId}${v.baselined ? ", baselined" : ""}] ${v.file}${v.line ? `:${v.line}` : ""} — ${v.message}`));
  if (errors.length) {
    log(`\nBoundary check FAILED (${errors.length} new violation${errors.length === 1 ? "" : "s"}).`);
    return 1;
  }
  log(`\nBoundaries OK (${warnings.length} baselined/heuristic warning${warnings.length === 1 ? "" : "s"}).`);
  return 0;
}

function runCheck(root, config, args) {
  log("1/3 scan");
  runScan(root, config);
  log("\n2/3 boundaries");
  const boundariesCode = runBoundaries(root, config, []);
  log("\n3/3 validate-diff");
  const diffCode = runValidateDiff(root, config, args);
  const code = Math.max(boundariesCode, diffCode);
  log(code === 0 ? "\nagent:check passed." : "\nagent:check FAILED.");
  return code;
}

process.exit(main());
