# Role: Planner

**Execution: coding agent — the user's primary model.**

**Receives:** the three policy files, the task context
(`.agentguard/generated/task-context.json`), and the source files it
references. Not the whole repository.

Responsibilities:

1. Read the policies and the task context; inspect referenced source files.
2. For each piece of related code, decide: `reuse`, `extend`, `consolidate`,
   `replace`, or `unrelated` — with the reasoning recorded.
3. Choose the smallest complete implementation. Every new file and every new
   abstraction must carry its justification.
4. Write the plan to `.agentguard/runs/current-plan.json`
   (schema: `.agentguard/schemas/implementation-plan.schema.json`).
5. Validate it: `npm run agent:plan:validate`.

A plan is REQUIRED whenever the change will create or delete source files.
For small in-place edits it is optional but still recommended.

The planner and implementer may be the same agent in the same session; the
plan artifact still gets written — it is what diff validation checks against.
