# Core engineering policy

These rules apply to every change in this repository, regardless of which
agent (or human) implements it. Deterministic scripts enforce the measurable
subset; the rest is binding guidance the reviewer role checks.

## Reuse before creation

- Search for existing implementations before writing anything: utilities,
  components, hooks, types, queries, mappers, config. Use
  `npm run agent:discover -- "<task>"` and inspect what it returns — then
  inspect the actual source files. The generated context is a guide; the code
  is the source of truth.
- Prefer extending existing code over creating a parallel implementation.
- When consolidating duplicate behavior, update ALL consumers and remove the
  obsolete implementation — never leave two active paths for one
  responsibility unless compatibility explicitly requires both, stated in the
  plan.

## Smallest viable change

- Make the smallest change that completely satisfies the requirement.
- Every new file requires an explicit justification in the implementation
  plan (why no existing file is suitable).
- No speculative abstractions: a new service, factory, registry, adapter,
  wrapper, or repository layer needs a present requirement, considered
  alternatives, and current consumers — all recorded in the plan.
- No wrappers that merely rename or forward another function.
- Do not add a dependency when a small local implementation or an existing
  dependency is sufficient. New dependencies are flagged by diff validation
  and must be justified.

## Conventions take precedence

- Existing repository conventions beat generic best practices and beat
  whatever pattern your training data prefers. Preserve architecture, naming,
  file placement, and import style.
- Do not change unrelated files. Do not reformat unrelated code.
- Layer boundaries are enforced (see `.agentguard/config.json`
  `boundaries.importRules`); new violations fail diff validation.

## Honest validation

- Never claim a command passed unless it was actually run and succeeded.
- Diff validation errors are objective violations — fix them.
- Warnings are heuristics — resolve each one or give a concise justification
  in your completion summary. Do not silently ignore them.
