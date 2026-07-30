# AgentGuard

Repository-owned engineering governance for AI coding agents (and humans).
Local, deterministic, zero tokens, zero network. Any agent — Claude Code,
Codex, Cursor, Copilot — operates under the same repository-owned policies
and validation gates; the agent is a replaceable implementer.

## What it does

- **Scan** — builds a compact project map (files, imports, exports, symbols,
  flags) so agents inspect a small artifact instead of re-reading the repo.
- **Discover** — deterministically ranks files related to a task into a
  compact context artifact.
- **Plan validation** — a structured implementation plan (what will be
  reused, extended, created, deleted — and why) is checked for objective
  validity.
- **Diff validation** — the real git diff is compared against the plan, the
  layer boundaries, and the repo's hard invariants.
- **Boundaries** — the AGENTS.md layer diagram and core invariants, made
  executable: path-based import rules + forbidden-content patterns.

## What it does NOT do

- No model calls, embeddings, or network access — ever, in any command.
- No automatic refactoring or deletion of "suspected duplicate" code.
- No git hooks or CI installation (validate locally first; wire CI when the
  workflow has proven itself).
- Name similarity is a *warning with evidence*, never a claim of semantic
  equivalence.

## The workflow

```bash
# 1. Refresh the project map (incremental, cached)
npm run agent:scan

# 2. Find related code for your task; inspect what it points at
npm run agent:discover -- "Describe the requested change"

# 3. If the task creates/deletes files: write the plan, then validate it
#    (schema: .agentguard/schemas/implementation-plan.schema.json)
npm run agent:plan:validate            # validates .agentguard/runs/current-plan.json

# 4. Implement the smallest complete change

# 5. Gate before finishing
npm run agent:diff:validate            # plan match + boundaries + heuristics
npm run lint && npm run build          # the repo's own bar (see AGENTS.md)
```

`npm run agent:check` = scan + boundaries + diff validation in one shot.
`npm run agent:test` runs AgentGuard's own test suite.

## Errors vs warnings

- **Errors** (exit 1) are objective: an unplanned created/deleted source
  file, a planned file that never materialized, a NEW layer-boundary or
  invariant violation, an invalid plan, an AgentGuard policy file changed
  without being planned.
- **Warnings** (exit 0) are heuristics with evidence: similar symbol/file
  names, new dependencies, many new files, unplanned modifications. Resolve
  each or justify it in your completion summary — never silently ignore.

## When is a plan required?

Only when the diff **creates or deletes source files** — the moment
duplication and drift risk actually appears. In-place edits pass diff
validation without a plan (if a plan exists anyway, it is still enforced).

## Generated vs committed

| Path | Status |
| --- | --- |
| `.agentguard/config.json`, `schemas/`, `policies/`, `roles/`, `baseline.json` | **committed** — the contract |
| `.agentguard/generated/` (project map, task context) | ignored — regenerate locally |
| `.agentguard/cache/`, `.agentguard/runs/` | ignored — local artifacts |

Never hand-edit anything under `generated/`, `cache/`, or the baseline
(regenerate it with `node tools/agentguard/cli.mjs boundaries --update-baseline`).

## Baseline

Violations that existed when AgentGuard was installed are recorded in
`baseline.json` and reported as warnings — installation never forces a
refactor. Anything NOT in the baseline fails. If you deliberately fix a
baselined violation, regenerate the baseline so it shrinks.

## Boundaries & the CMS integration

The import rules in `config.json` encode the AGENTS.md architecture
(components → `lib/content` → `lib/cms`; `lib/cache` CMS-free; adapter
internals private). They are **path-based**, not package-based — this repo
deliberately has no CMS SDK, so the boundary is the `lib/cms/contentful/`
directory itself.

To disable the Contentful integration (e.g. after swapping CMS): set
`integrations.contentful.enabled = false` — rules tagged
`"integration": "contentful"` stop running. To support another CMS later:
implement the `CmsAdapter` seam under `lib/cms/<provider>/`, add equivalent
import rules/invariants, and write a `policies/<provider>.md`. Core policies
and all tooling are CMS-agnostic.

## Model roles & cost

Scanner and discovery are deterministic scripts — no tokens. Planner and
implementer run on your primary coding model reading compact artifacts.
The reviewer role (`roles/reviewer.md`) is a manually-invoked high-reasoning
pass over plan + diff + validation report. No model or provider name is
hard-coded anywhere.

## Common failures

| Symptom | Fix |
| --- | --- |
| `project-map.json missing` | `npm run agent:scan` |
| `diff creates source files but no plan exists` | write `.agentguard/runs/current-plan.json`, validate, re-run |
| `New file X is not in the plan's filesToCreate` | update + re-validate the plan (deliberate act), or fold the change into an existing file |
| `[cms-adapter-internals] …` | import via the `lib/cms` public API instead of adapter internals |
| `[no-fetch-cache-options] …` | remove Next data-layer caching; the CDN owns caching (AGENTS.md invariants) |
| Policy file changed error | list the `.agentguard/`/`AGENTS.md` change in your plan — policy edits must be deliberate |

## Design notes

- **Repository-local first**: implemented inside this repo for immediate use
  and real feedback; the clean `tools/` (generic) vs `.agentguard/`
  (project-specific) split keeps later npm extraction mechanical.
- **Deterministic before semantic**: AST + metadata, reproducible output, no
  volatile timestamps. The project-map schema is versioned so semantic
  metadata (embeddings) could be added later without breaking consumers.
- **Scripts stay generic**: nothing under `tools/agentguard/` may hard-code
  knowledge of this project — that discipline is what makes the toolkit
  portable to the next boilerplate-derived project.
