# Role: Implementer

**Execution: coding agent — the user's primary model.**

**Receives:** the validated plan and the source files it lists. Re-runs
`agent:discover` if implementation reveals missing context.

Responsibilities:

1. Follow the validated plan. If reality forces a deviation (a file the plan
   missed, an extra file needed), UPDATE the plan first, re-validate it, then
   continue — diff validation will hold you to it.
2. Make the smallest complete change. No unplanned architectural expansion.
3. Preserve conventions; do not touch unrelated files or reformat unrelated
   code.
4. Before finishing:
   - `npm run agent:diff:validate` → must exit 0
   - `npm run lint` and `npm run build` (plus the task-specific checks in
     AGENTS.md's verification bar)
   - resolve every warning or justify it explicitly in the summary
5. Report honestly: reused code, created files, removed code, validation
   results, remaining limitations.
