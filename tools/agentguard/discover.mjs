/**
 * Deterministic task discovery. GENERIC MODULE.
 *
 * Scores project-map files against a task description and emits the compact
 * `.agentguard/generated/task-context.json` that planner/implementer agents
 * read instead of re-crawling the repository. No model, no network.
 */
import fs from "node:fs";
import path from "node:path";
import { AGENTGUARD_DIR, TASK_CONTEXT_FILE, writeJson } from "./config.mjs";
import { jaccard, splitIdentifier } from "./similarity.mjs";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "at", "with",
  "we", "our", "should", "must", "that", "this", "it", "be", "is", "are",
  // task verbs that would otherwise match unrelated symbols
  "add", "create", "implement", "fix", "make", "new", "use", "so", "when",
]);

export function tokenizeTask(task) {
  return [...new Set(splitIdentifier(task).filter((t) => !STOPWORDS.has(t) && t.length > 1))];
}

export function discover(root, config, map, task, { write = true } = {}) {
  const taskTokens = tokenizeTask(task);
  const scored = [];

  for (const file of map.files) {
    const pathTokens = splitIdentifier(file.path);
    const symbolNames = file.exports.map((e) => e.name);
    const symbolTokens = symbolNames.flatMap(splitIdentifier);
    const docTokens = file.doc ? splitIdentifier(file.doc) : [];
    const importTokens = file.imports.flatMap(splitIdentifier);

    let score = 0;
    const reasons = [];
    for (const token of taskTokens) {
      if (pathTokens.includes(token)) {
        score += 3;
        reasons.push(`path matches "${token}"`);
      }
      const symbolHit = symbolNames.find((n) => splitIdentifier(n).includes(token));
      if (symbolHit) {
        score += 2;
        reasons.push(`exports "${symbolHit}" (matches "${token}")`);
      }
      if (docTokens.includes(token)) {
        score += 1;
        reasons.push(`doc comment mentions "${token}"`);
      }
      if (importTokens.includes(token)) {
        score += 1;
        reasons.push(`imports mention "${token}"`);
      }
    }
    score += 2 * jaccard(taskTokens, [...pathTokens, ...symbolTokens]);
    if (score > 0) scored.push({ file, score, reasons: [...new Set(reasons)] });
  }

  scored.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  const top = scored.slice(0, config.context.maximumCandidates);
  const maxScore = top[0]?.score ?? 1;

  const candidates = top.map(({ file, score, reasons }) => ({
    path: file.path,
    score: Math.round((score / maxScore) * 100) / 100,
    reasons,
    symbols: file.exports.map((e) => e.name).slice(0, config.context.maximumSymbolsPerFile),
  }));

  const relatedDependencies = collectRelated(map, candidates);
  const warnings = [];
  if (candidates.length === 0) {
    warnings.push(
      "Discovery found no related files. If a wider manual search also finds none, the implementation plan may declare no relevant existing code — with an explicit explanation.",
    );
  }

  const context = {
    schemaVersion: 1,
    task,
    policies: listPolicies(root),
    candidates,
    relatedDependencies,
    warnings,
  };
  if (write) writeJson(path.join(root, TASK_CONTEXT_FILE), context);
  return context;
}

/** Files that import or are imported by the top candidates (1 hop, capped). */
function collectRelated(map, candidates, topN = 5, cap = 10) {
  const candidatePaths = new Set(candidates.map((c) => c.path));
  const topPaths = candidates.slice(0, topN).map((c) => c.path);
  const related = new Map();

  const toModule = (p) => p.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  const importsModule = (imports, filePath) => {
    const mod = toModule(filePath);
    return imports.includes(mod) || (mod.endsWith("/index") && imports.includes(mod.slice(0, -"/index".length)));
  };

  for (const file of map.files) {
    if (candidatePaths.has(file.path)) continue;
    for (const top of topPaths) {
      const topEntry = map.files.find((f) => f.path === top);
      if (importsModule(file.localImports ?? [], top)) {
        if (!related.has(file.path)) related.set(file.path, { path: file.path, relation: `imports ${top}` });
      } else if (importsModule(topEntry?.localImports ?? [], file.path)) {
        if (!related.has(file.path)) related.set(file.path, { path: file.path, relation: `imported by ${top}` });
      }
    }
  }
  return [...related.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(0, cap);
}

function listPolicies(root) {
  const dir = path.join(root, AGENTGUARD_DIR, "policies");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => `${AGENTGUARD_DIR}/policies/${f}`);
}
