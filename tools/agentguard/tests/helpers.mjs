/** Shared fixture-repo builder for AgentGuard tests. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Deep-merged config with the same defaults loadConfig applies. */
export function makeConfig(overrides = {}) {
  return {
    version: 1,
    project: { framework: "test", language: "typescript", sourceRoots: ["src"], ...overrides.project },
    scan: {
      includeExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
      exclude: ["node_modules", ".next", ".git", ".agentguard", "dist"],
      maxFileSizeBytes: 500_000,
      ...overrides.scan,
    },
    boundaries: { importRules: [], invariants: [], ...overrides.boundaries },
    integrations: overrides.integrations ?? {},
    validation: { newFileCountWarningThreshold: 3, similarityThreshold: 0.65, ...overrides.validation },
    context: { maximumCandidates: 20, maximumSymbolsPerFile: 50, ...overrides.context },
  };
}

/**
 * Create a temp fixture repo. `files` maps relPath → content. Always writes a
 * tsconfig with the `@/*` alias and an .agentguard/config.json so CLI-level
 * functions work. Returns { root, write, remove, git }.
 */
export function makeFixture(files = {}, { config = makeConfig(), git = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentguard-test-"));
  const write = (rel, content) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }));
  write(".agentguard/config.json", JSON.stringify(config, null, 2));
  write("package.json", JSON.stringify({ name: "fixture", dependencies: {}, devDependencies: {} }, null, 2));
  for (const [rel, content] of Object.entries(files)) write(rel, content);

  const runGit = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
    });
  if (git) {
    runGit("init", "-q");
    runGit("add", "-A");
    runGit("commit", "-qm", "initial");
  }

  return {
    root,
    write,
    remove: (rel) => fs.rmSync(path.join(root, rel), { recursive: true, force: true }),
    git: runGit,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
