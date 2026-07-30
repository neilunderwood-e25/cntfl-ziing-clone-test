/**
 * Deterministic project scanner. GENERIC MODULE — no project knowledge here.
 *
 * Walks the configured source roots, parses each file with the repository's
 * own TypeScript compiler (parse only, no type checking), and produces
 * `.agentguard/generated/project-map.json` plus an incremental cache under
 * `.agentguard/cache/`. Output is stable for unchanged input: no timestamps,
 * every list sorted.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  CACHE_FILE,
  PROJECT_MAP_FILE,
  detectPackageManager,
  loadPathAliases,
  matchesAny,
  readJson,
  resolveImport,
  writeJson,
} from "./config.mjs";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

// Plain codepoint comparison — locale-independent so map output is stable
// on every machine (localeCompare ordering varies with ICU).
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function scan(root, config, { write = true } = {}) {
  const relFiles = walkSourceRoots(root, config);
  const previous = safeCache(readJson(path.join(root, CACHE_FILE)));
  const nextCache = { schemaVersion: 1, files: {} };
  const stats = { total: relFiles.length, reusedStat: 0, reusedHash: 0, parsed: 0 };

  const fileEntries = [];
  for (const rel of relFiles) {
    const abs = path.join(root, rel);
    const stat = fs.statSync(abs);
    const cached = previous.files[rel];
    let entry;
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      entry = cached;
      stats.reusedStat++;
    } else {
      const content = fs.readFileSync(abs, "utf8");
      const hash = sha256(content);
      if (cached && cached.hash === hash) {
        entry = { ...cached, size: stat.size, mtimeMs: stat.mtimeMs };
        stats.reusedHash++;
      } else {
        entry = { size: stat.size, mtimeMs: stat.mtimeMs, hash, analysis: analyzeSource(rel, content) };
        stats.parsed++;
      }
    }
    nextCache.files[rel] = entry;
    fileEntries.push({ path: rel, hash: entry.hash, size: entry.size, ...entry.analysis });
  }

  // Split raw import specifiers into package imports and resolved local
  // module paths. Done at map-build time (cheap, alias-dependent) so cached
  // analyses stay resolution-agnostic.
  const aliases = loadPathAliases(root);
  for (const entry of fileEntries) {
    const packages = [];
    const locals = [];
    for (const spec of entry.imports) {
      const resolved = resolveImport(spec, entry.path, aliases);
      if (resolved) locals.push(resolved);
      else packages.push(spec);
    }
    entry.imports = [...new Set(packages)].sort();
    entry.localImports = [...new Set(locals)].sort();
  }

  const map = buildMap(root, config, fileEntries);
  if (write) {
    writeJson(path.join(root, PROJECT_MAP_FILE), map);
    writeJson(path.join(root, CACHE_FILE), nextCache);
  }
  return { map, stats };
}

function safeCache(cache) {
  return cache && cache.schemaVersion === 1 && cache.files ? cache : { schemaVersion: 1, files: {} };
}

export function walkSourceRoots(root, config) {
  const results = [];
  for (const sourceRoot of config.project.sourceRoots) {
    const abs = path.join(root, sourceRoot);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isFile()) {
      if (includable(sourceRoot, config)) results.push(toPosix(sourceRoot));
      continue;
    }
    walkDir(root, sourceRoot, config, results);
  }
  return results.sort();
}

function walkDir(root, relDir, config, results) {
  for (const dirent of fs.readdirSync(path.join(root, relDir), { withFileTypes: true })) {
    const rel = toPosix(path.join(relDir, dirent.name));
    if (excluded(rel, dirent.name, config)) continue;
    if (dirent.isDirectory()) walkDir(root, rel, config, results);
    else if (dirent.isFile() && includable(rel, config)) {
      if (fs.statSync(path.join(root, rel)).size <= config.scan.maxFileSizeBytes) results.push(rel);
    }
  }
}

function excluded(rel, basename, config) {
  return config.scan.exclude.some((e) => e === basename || e === rel || rel.startsWith(e + "/") || matchesAny(rel, [e]));
}

function includable(rel, config) {
  return config.scan.includeExtensions.includes(path.posix.extname(rel));
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Parse one source file and extract its structural facts. Exported for reuse by the diff validator. */
export function analyzeSource(relPath, content) {
  const isTsx = relPath.endsWith(".tsx") || relPath.endsWith(".jsx");
  const source = ts.createSourceFile(
    relPath,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const imports = new Set();
  const exports = [];
  const components = new Set();
  const hooks = new Set();

  const addExport = (name, kind) => {
    if (name) exports.push({ name, kind });
    if (name && /^[A-Z]/.test(name) && isTsx && (kind === "function" || kind === "variable" || kind === "class")) {
      components.add(name);
    }
    if (name && /^use[A-Z0-9]/.test(name) && (kind === "function" || kind === "variable")) hooks.add(name);
  };
  const isExported = (node) => (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.add(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        imports.add(statement.moduleSpecifier.text);
      }
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const el of statement.exportClause.elements) addExport(el.name.text, "reexport");
      }
    } else if (ts.isFunctionDeclaration(statement)) {
      if (isExported(statement)) addExport(statement.name?.text ?? "default", "function");
    } else if (ts.isClassDeclaration(statement)) {
      if (isExported(statement)) addExport(statement.name?.text ?? "default", "class");
    } else if (ts.isInterfaceDeclaration(statement)) {
      if (isExported(statement)) addExport(statement.name.text, "interface");
    } else if (ts.isTypeAliasDeclaration(statement)) {
      if (isExported(statement)) addExport(statement.name.text, "type");
    } else if (ts.isEnumDeclaration(statement)) {
      if (isExported(statement)) addExport(statement.name.text, "enum");
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const isFn = decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer));
        addExport(decl.name.text, isFn ? "function" : "variable");
      }
    } else if (ts.isExportAssignment(statement)) {
      addExport(ts.isIdentifier(statement.expression) ? statement.expression.text : "default", "default");
    }
  }

  const directives = content.slice(0, 600);
  const isRoute = /(^|\/)route\.(ts|js|mjs)$/.test(relPath);
  const flags = {
    clientComponent: /^\s*(['"])use client\1/m.test(directives),
    serverAction: /^\s*(['"])use server\1/m.test(directives),
    routeHandler: isRoute && exports.some((e) => HTTP_METHODS.has(e.name)),
  };

  // First JSDoc block in the file — file header or leading declaration doc.
  const docMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
  const doc = docMatch
    ? docMatch[1].replace(/^\s*\*\s?/gm, "").replace(/\s+/g, " ").trim().slice(0, 240)
    : undefined;

  return {
    imports: [...imports].sort(),
    exports: exports.sort((a, b) => byString(a.name, b.name)),
    components: [...components].sort(),
    hooks: [...hooks].sort(),
    flags,
    ...(doc ? { doc } : {}),
  };
}

function buildMap(root, config, fileEntries) {
  const pkg = readJson(path.join(root, "package.json")) ?? {};
  const symbols = [];
  for (const file of fileEntries) {
    for (const exp of file.exports) {
      symbols.push({ name: exp.name, kind: exp.kind, file: file.path, exported: true });
    }
  }
  symbols.sort((a, b) => byString(a.name, b.name) || byString(a.file, b.file));

  return {
    schemaVersion: 1,
    repository: {
      framework: config.project.framework ?? "unknown",
      language: config.project.language ?? "unknown",
      packageManager: detectPackageManager(root),
    },
    files: fileEntries.sort((a, b) => byString(a.path, b.path)),
    symbols,
    dependencies: {
      runtime: Object.keys(pkg.dependencies ?? {}).sort(),
      development: Object.keys(pkg.devDependencies ?? {}).sort(),
    },
  };
}
