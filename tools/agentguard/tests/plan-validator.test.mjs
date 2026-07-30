import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePlan } from "../plan-validator.mjs";
import { makeFixture } from "./helpers.mjs";

const EXISTING = "src/lib/helper.ts";

function validPlan(overrides = {}) {
  return {
    schemaVersion: 1,
    task: "Extend the helper",
    summary: "Smallest change: add one function to the existing helper.",
    existingCode: [{ path: EXISTING, relevance: "Owns this responsibility", decision: "extend" }],
    filesToModify: [{ path: EXISTING, reason: "Extend it" }],
    filesToCreate: [],
    filesToDelete: [],
    newDependencies: [],
    newAbstractions: [],
    validationCommands: ["npm test"],
    ...overrides,
  };
}

function setup(t) {
  const fx = makeFixture({ [EXISTING]: "export const x = 1;" });
  t.after(fx.cleanup);
  return fx;
}

test("accepts a valid plan", (t) => {
  const fx = setup(t);
  assert.deepEqual(validatePlan(fx.root, validPlan()).errors, []);
});

test("rejects a new file without justification", (t) => {
  const fx = setup(t);
  const { errors } = validatePlan(fx.root, validPlan({ filesToCreate: [{ path: "src/new.ts" }] }));
  assert.ok(errors.some((e) => e.includes('"reason"')), errors.join("\n"));
});

test("rejects duplicate and conflicting paths", (t) => {
  const fx = setup(t);
  const conflict = validPlan({ filesToDelete: [{ path: EXISTING }] }); // also in filesToModify
  assert.ok(validatePlan(fx.root, conflict).errors.some((e) => e.includes("more than one change list")));
});

test("rejects path traversal and absolute paths", (t) => {
  const fx = setup(t);
  const { errors } = validatePlan(
    fx.root,
    validPlan({ filesToCreate: [{ path: "../outside.ts", reason: "escape" }, { path: "/etc/passwd", reason: "nope" }] }),
  );
  assert.equal(errors.filter((e) => e.includes("repo-relative")).length, 2);
});

test("rejects modification of a file that does not exist", (t) => {
  const fx = setup(t);
  const { errors } = validatePlan(fx.root, validPlan({ filesToModify: [{ path: "src/ghost.ts" }] }));
  assert.ok(errors.some((e) => e.includes("does not exist")));
});

test("requires discovery evidence, but accepts an explicit no-match explanation", (t) => {
  const fx = setup(t);
  const empty = validatePlan(fx.root, validPlan({ existingCode: [] }));
  assert.ok(empty.errors.some((e) => e.includes("existingCode")));

  const explained = validatePlan(
    fx.root,
    validPlan({ existingCode: [], noExistingCodeExplanation: "Discovery and manual search found no related implementation." }),
  );
  assert.deepEqual(explained.errors, []);
});

test("requires present-need justification for new abstractions", (t) => {
  const fx = setup(t);
  const { errors } = validatePlan(fx.root, validPlan({ newAbstractions: [{ name: "WidgetFactory" }] }));
  assert.ok(errors.some((e) => e.includes("presentRequirement")));
});
