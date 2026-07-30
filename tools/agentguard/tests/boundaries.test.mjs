import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBaseline, checkBoundaries, loadBaseline, stripComments, writeBaseline } from "../boundaries.mjs";
import { scan } from "../scan.mjs";
import { makeConfig, makeFixture } from "./helpers.mjs";

const IMPORT_RULES = [
  {
    id: "adapter-private",
    description: "adapter internals are private to src/cms",
    targets: ["src/cms/vendor/**"],
    allowedImporters: ["src/cms/**"],
    severity: "error",
  },
  {
    id: "cache-cms-free",
    targets: ["src/cms/**"],
    targetExceptions: ["src/cms/types"],
    deniedImporters: ["src/cache/**"],
    severity: "error",
  },
];

const FILES = {
  "src/cms/vendor/client.ts": `export const client = 1;`,
  "src/cms/index.ts": `import { client } from "./vendor/client";\nexport const cms = client;`,
  "src/cache/purge.ts": `import type { T } from "@/src/cms/types";\nexport const purge = (t: T) => t;`,
  "src/cms/types.ts": `export type T = string;`,
  "src/pages.ts": `import { client } from "@/src/cms/vendor/client";\nexport const page = client;`,
};

function setup(t, { invariants = [], integrations = {}, files = FILES } = {}) {
  const config = makeConfig({ boundaries: { importRules: IMPORT_RULES, invariants }, integrations });
  const fx = makeFixture(files, { config });
  t.after(fx.cleanup);
  const { map } = scan(fx.root, config);
  return { fx, config, map };
}

test("import rules: allowed importers pass, outsiders violate, exceptions respected", (t) => {
  const { fx, config, map } = setup(t);
  const violations = checkBoundaries(fx.root, config, map, {});
  assert.deepEqual(
    violations.map((v) => `${v.ruleId}:${v.file}`),
    ["adapter-private:src/pages.ts"],
    "cms/index may use vendor internals; cache may import the neutral types exception; pages.ts may not deep-import",
  );
});

test("invariants: forbidden patterns are found with line numbers, comments never fire", (t) => {
  const invariants = [
    {
      id: "no-revalidate",
      paths: ["src/**"],
      pattern: "\\bunstable_cache\\b",
      message: "no Next-side caching",
      severity: "error",
    },
  ];
  const files = {
    "src/bad.ts": `// unstable_cache mentioned in a comment is fine\nimport { unstable_cache } from "next/cache";\nexport const c = unstable_cache;`,
    "src/good.ts": `/* unstable_cache */\nexport const ok = 1;`,
  };
  const { fx, config, map } = setup(t, { invariants, files });
  const violations = checkBoundaries(fx.root, config, map, {});
  const inBad = violations.filter((v) => v.file === "src/bad.ts");
  assert.equal(inBad.length, 2, "import line + usage line, comment ignored");
  assert.deepEqual(inBad.map((v) => v.line), [2, 3]);
  assert.ok(!violations.some((v) => v.file === "src/good.ts"), "comment-only mention never fires");
});

test("baseline: recorded violations downgrade to warnings; new ones stay errors", (t) => {
  const { fx, config, map } = setup(t);
  const violations = checkBoundaries(fx.root, config, map, {});
  writeBaseline(fx.root, violations);

  const { errors, warnings } = applyBaseline(checkBoundaries(fx.root, config, map, {}), loadBaseline(fx.root));
  assert.equal(errors.length, 0, "all current violations are baselined");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].baselined, true);

  // A new violation in a different file is NOT covered by the baseline.
  fx.write("src/other.ts", `import { client } from "@/src/cms/vendor/client";\nexport const o = client;`);
  const { map: map2 } = scan(fx.root, config);
  const after = applyBaseline(checkBoundaries(fx.root, config, map2, {}), loadBaseline(fx.root));
  assert.deepEqual(after.errors.map((v) => v.file), ["src/other.ts"]);
});

test("rules tagged with a disabled integration are skipped", (t) => {
  const invariants = [
    {
      id: "no-sdk",
      integration: "contentful",
      paths: ["src/**"],
      pattern: "from\\s+[\"']contentful",
      severity: "error",
    },
  ];
  const files = { "src/uses-sdk.ts": `import c from "contentful";\nexport const x = c;` };

  const enabled = setup(t, { invariants, integrations: { contentful: { enabled: true } }, files });
  assert.equal(checkBoundaries(enabled.fx.root, enabled.config, enabled.map, {}).length, 1);

  const disabled = setup(t, { invariants, integrations: { contentful: { enabled: false } }, files });
  assert.equal(checkBoundaries(disabled.fx.root, disabled.config, disabled.map, {}).length, 0);
});

test("stripComments preserves offsets and string directives", () => {
  const src = `"use client";\n// comment\nconst x = "not // a comment";`;
  const stripped = stripComments(src);
  assert.equal(stripped.length, src.length);
  assert.ok(stripped.includes(`"use client"`));
  assert.ok(stripped.includes(`"not // a comment"`));
  assert.ok(!stripped.includes("// comment"));
});
