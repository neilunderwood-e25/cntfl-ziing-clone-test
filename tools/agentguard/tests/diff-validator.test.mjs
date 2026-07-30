import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { validateDiff } from "../diff-validator.mjs";
import { scan } from "../scan.mjs";
import { makeConfig, makeFixture } from "./helpers.mjs";

const FILES = {
  "src/lib/helper.ts": `export function formatDate(d: Date) { return d.toISOString(); }\n`,
  "src/lib/pages.ts": `export function fetchPage() { return 1; }\n`,
};

function setup(t, configOverrides = {}) {
  const config = makeConfig(configOverrides);
  const fx = makeFixture(FILES, { config, git: true });
  t.after(fx.cleanup);
  scan(fx.root, config); // project map at the pre-change state
  return { fx, config };
}

function writePlan(fx, plan) {
  fx.write(
    ".agentguard/runs/current-plan.json",
    JSON.stringify({
      schemaVersion: 1,
      task: "test task",
      summary: "smallest change",
      existingCode: [{ path: "src/lib/helper.ts", relevance: "related", decision: "extend" }],
      filesToModify: [],
      filesToCreate: [],
      filesToDelete: [],
      validationCommands: ["true"],
      ...plan,
    }),
  );
}

test("an unplanned new source file is an error; a planned one passes", (t) => {
  const { fx, config } = setup(t);
  fx.write("src/lib/extra.ts", "export const extra = 1;\n");

  const noPlan = validateDiff(fx.root, config);
  assert.ok(noPlan.errors.some((e) => e.includes("no implementation plan exists")), noPlan.errors.join("\n"));

  writePlan(fx, { filesToCreate: [{ path: "src/lib/extra.ts", reason: "no existing file owns this" }] });
  const planned = validateDiff(fx.root, config);
  assert.deepEqual(planned.errors, []);
});

test("an unplanned deletion is an error; planned-but-missing files are errors", (t) => {
  const { fx, config } = setup(t);
  fx.remove("src/lib/pages.ts");
  writePlan(fx, {}); // plan exists but does not mention the deletion
  const result = validateDiff(fx.root, config);
  assert.ok(result.errors.some((e) => e.includes('Deleted file "src/lib/pages.ts"')));

  writePlan(fx, {
    filesToDelete: [{ path: "src/lib/pages.ts" }],
    filesToCreate: [{ path: "src/lib/never-made.ts", reason: "promised but not delivered" }],
  });
  const result2 = validateDiff(fx.root, config);
  assert.ok(result2.errors.some((e) => e.includes("never-made.ts")), "planned file that never materialized");
  // Note: plan-validator requires filesToDelete paths to exist pre-implementation;
  // post-implementation the diff validator accepts the already-deleted state.
});

test("plan-free in-place edits pass; warnings alone never fail", (t) => {
  const { fx, config } = setup(t);
  // A new export in pages.ts that duplicates helper.ts's responsibility —
  // similar names ACROSS files warn; adding next to the original would not.
  fx.write("src/lib/pages.ts", `export function fetchPage() { return 1; }\nexport function formatDates(ds: Date[]) { return ds.map(String); }\n`);
  const result = validateDiff(fx.root, config);
  assert.deepEqual(result.errors, [], "modifying an existing file requires no plan");
  assert.ok(
    result.warnings.some((w) => w.includes('"formatDates"') && w.includes('"formatDate"')),
    `similar-symbol warning with evidence: ${result.warnings.join("\n")}`,
  );
});

test("new dependencies and similar new files produce warnings with evidence", (t) => {
  const { fx, config } = setup(t);
  const pkg = JSON.parse(fs.readFileSync(path.join(fx.root, "package.json"), "utf8"));
  pkg.dependencies.leftpad = "1.0.0";
  fx.write("package.json", JSON.stringify(pkg, null, 2));
  fx.write("src/lib/helpers.ts", "export const two = 2;\n");
  writePlan(fx, { filesToCreate: [{ path: "src/lib/helpers.ts", reason: "test" }] });

  const result = validateDiff(fx.root, config);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => w.includes('dependency "leftpad"')));
  assert.ok(
    result.warnings.some((w) => w.includes("src/lib/helpers.ts") && w.includes("src/lib/helper.ts")),
    "helpers.ts flagged as resembling helper.ts",
  );
});

test("new boundary violations in the diff are errors", (t) => {
  const { fx, config } = setup(t, {
    boundaries: {
      invariants: [
        { id: "no-isr", paths: ["src/**"], pattern: "^export\\s+const\\s+revalidate\\b", flags: "m", severity: "error" },
      ],
    },
  });
  fx.write("src/lib/helper.ts", `export const revalidate = 60;\nexport function formatDate(d: Date) { return d.toISOString(); }\n`);
  const result = validateDiff(fx.root, config);
  assert.ok(result.errors.some((e) => e.includes("[no-isr]") && e.includes("src/lib/helper.ts")), result.errors.join("\n"));
});

test("changing AgentGuard policy artifacts without a plan is an error", (t) => {
  const { fx, config } = setup(t);
  fx.write(".agentguard/policies/core.md", "# weakened policy\n");
  const result = validateDiff(fx.root, config);
  assert.ok(result.errors.some((e) => e.includes(".agentguard/policies/core.md")));
});
