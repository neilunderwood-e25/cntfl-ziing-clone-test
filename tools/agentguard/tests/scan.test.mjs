import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "../scan.mjs";
import { makeConfig, makeFixture } from "./helpers.mjs";

const CLIENT_COMPONENT = `"use client";
import { useState } from "react";
import { helper } from "@/src/lib/helper";

export function Widget() {
  const [n] = useState(0);
  return <div>{n}{helper()}</div>;
}
export function useWidgetState() { return useState(0); }
`;

const LIB_HELPER = `import contentful from "contentful";
/** Formats things nicely. */
export function helper(): string { return "x"; }
export interface HelperOptions { verbose: boolean }
export type HelperResult = string;
export const HELPER_VERSION = 1;
`;

function fixtureFiles() {
  return {
    "src/components/widget.tsx": CLIENT_COMPONENT,
    "src/lib/helper.ts": LIB_HELPER,
    "src/skipme/ignored.ts": "export const nope = 1;",
    "dist/build-artifact.ts": "export const built = 1;",
  };
}

test("scanner extracts imports, exports, and flags", (t) => {
  const config = makeConfig({ scan: { exclude: ["node_modules", ".git", ".agentguard", "dist", "src/skipme"] } });
  const fx = makeFixture(fixtureFiles(), { config });
  t.after(fx.cleanup);

  const { map } = scan(fx.root, config);
  const paths = map.files.map((f) => f.path);
  assert.deepEqual(paths, ["src/components/widget.tsx", "src/lib/helper.ts"], "excluded dirs are skipped");

  const helper = map.files.find((f) => f.path === "src/lib/helper.ts");
  assert.deepEqual(helper.imports, ["contentful"], "package imports identified (incl. CMS SDK)");
  assert.deepEqual(
    helper.exports.map((e) => `${e.name}:${e.kind}`),
    ["HELPER_VERSION:variable", "HelperOptions:interface", "HelperResult:type", "helper:function"],
  );
  assert.match(helper.doc, /Formats things nicely/);

  const widget = map.files.find((f) => f.path === "src/components/widget.tsx");
  assert.equal(widget.flags.clientComponent, true, `identifies "use client"`);
  assert.deepEqual(widget.localImports, ["src/lib/helper"], "alias imports resolve to local module paths");
  assert.deepEqual(widget.components, ["Widget"]);
  assert.deepEqual(widget.hooks, ["useWidgetState"]);

  assert.ok(map.symbols.some((s) => s.name === "helper" && s.file === "src/lib/helper.ts"));
});

test("scanner output is stable and cache is reused for unchanged files", (t) => {
  const config = makeConfig();
  const fx = makeFixture(fixtureFiles(), { config });
  t.after(fx.cleanup);

  const first = scan(fx.root, config);
  assert.ok(first.stats.parsed > 0);
  const second = scan(fx.root, config);
  assert.equal(second.stats.parsed, 0, "unchanged files reuse cached analysis");
  assert.equal(second.stats.reusedStat + second.stats.reusedHash, first.stats.total);
  assert.deepEqual(second.map, first.map, "repeated scans of unchanged code are byte-stable");
});

test("scanner removes deleted files from the map", (t) => {
  const config = makeConfig();
  const fx = makeFixture(fixtureFiles(), { config });
  t.after(fx.cleanup);

  scan(fx.root, config);
  fx.remove("src/lib/helper.ts");
  const { map } = scan(fx.root, config);
  assert.ok(!map.files.some((f) => f.path === "src/lib/helper.ts"));
  assert.ok(!map.symbols.some((s) => s.file === "src/lib/helper.ts"));
});
