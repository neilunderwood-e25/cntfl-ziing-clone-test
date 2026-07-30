import assert from "node:assert/strict";
import { test } from "node:test";
import { discover } from "../discover.mjs";
import { scan } from "../scan.mjs";
import { makeConfig, makeFixture } from "./helpers.mjs";

const FILES = {
  "src/lib/preview.ts": `/** Preview mode helpers. */\nexport function getPreviewContext() { return null; }\n`,
  "src/lib/pages.ts": `import { getPreviewContext } from "@/src/lib/preview";\nexport function fetchPage() { return getPreviewContext(); }\n`,
  "src/lib/math.ts": `export function add(a: number, b: number) { return a + b; }\n`,
  "src/components/banner.tsx": `export function Banner() { return <b/>; }\n`,
};

function setup(t, configOverrides = {}) {
  const config = makeConfig(configOverrides);
  const fx = makeFixture(FILES, { config });
  t.after(fx.cleanup);
  const { map } = scan(fx.root, config);
  return { fx, config, map };
}

test("discovery finds files by path term and symbol name, ranked above weak matches", (t) => {
  const { fx, config, map } = setup(t);
  const ctx = discover(fx.root, config, map, "Add preview support for pages", { write: false });
  const paths = ctx.candidates.map((c) => c.path);
  assert.equal(paths[0], "src/lib/preview.ts", "path+symbol+doc match ranks first");
  assert.ok(paths.includes("src/lib/pages.ts"));
  assert.ok(!paths.includes("src/lib/math.ts"), "unrelated files are excluded");
  assert.ok(ctx.candidates[0].reasons.length > 0, "every candidate carries reasons");
  assert.ok(ctx.candidates[0].symbols.includes("getPreviewContext"));
});

test("discovery limits candidates and is deterministic", (t) => {
  const { fx, config, map } = setup(t, { context: { maximumCandidates: 1 } });
  const a = discover(fx.root, config, map, "preview pages banner", { write: false });
  const b = discover(fx.root, config, map, "preview pages banner", { write: false });
  assert.equal(a.candidates.length, 1, "candidate count is bounded");
  assert.deepEqual(a, b, "same input produces identical output");
});

test("discovery includes dependency neighbors and flags no-match tasks", (t) => {
  const { fx, config, map } = setup(t, { context: { maximumCandidates: 1 } });
  const ctx = discover(fx.root, config, map, "preview", { write: false });
  assert.equal(ctx.candidates[0].path, "src/lib/preview.ts");
  assert.ok(
    ctx.relatedDependencies.some((r) => r.path === "src/lib/pages.ts"),
    "importer of the top candidate appears as related",
  );

  const none = discover(fx.root, config, map, "quantum teleporter", { write: false });
  assert.equal(none.candidates.length, 0);
  assert.equal(none.warnings.length, 1, "explicit no-match warning for the planner");
});
