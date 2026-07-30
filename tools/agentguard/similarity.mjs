/**
 * Local identifier-similarity heuristics. GENERIC MODULE.
 *
 * Findings based on these functions are WARNINGS by contract: name
 * similarity is evidence worth inspecting, never proof of semantic
 * equivalence.
 */

/**
 * Split an identifier or path segment into lowercase word tokens with light
 * plural normalization, so `formatDates` and `formatDate` (or `helpers.ts`
 * and `helper.ts`) compare as intended.
 */
export function splitIdentifier(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t))
    .filter(Boolean);
}

export function jaccard(tokensA, tokensB) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

export function nameSimilarity(nameA, nameB) {
  return jaccard(splitIdentifier(nameA), splitIdentifier(nameB));
}

/**
 * Compare new symbol names against the existing project-map symbols.
 * Returns [{ name, file, existingName, existingFile, score }] above threshold.
 */
export function findSimilarSymbols(newSymbols, mapSymbols, threshold) {
  const findings = [];
  for (const sym of newSymbols) {
    for (const existing of mapSymbols) {
      if (existing.file === sym.file) continue;
      const score = nameSimilarity(sym.name, existing.name);
      if (score >= threshold) {
        findings.push({
          name: sym.name,
          file: sym.file,
          existingName: existing.name,
          existingFile: existing.file,
          score: Math.round(score * 100) / 100,
        });
      }
    }
  }
  return findings.sort((a, b) => b.score - a.score);
}

/** Compare new file basenames against existing map files. */
export function findSimilarFiles(newFiles, existingFiles, threshold) {
  const base = (p) => p.split("/").pop().replace(/\.[^.]+$/, "");
  const findings = [];
  for (const file of newFiles) {
    for (const existing of existingFiles) {
      if (existing === file) continue;
      const score = nameSimilarity(base(file), base(existing));
      if (score >= threshold) {
        findings.push({ file, existingFile: existing, score: Math.round(score * 100) / 100 });
      }
    }
  }
  return findings.sort((a, b) => b.score - a.score);
}
