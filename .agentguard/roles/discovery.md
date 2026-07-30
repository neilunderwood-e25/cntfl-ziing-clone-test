# Role: Discovery

**Default execution: deterministic script** (`npm run agent:discover -- "<task>"`) — zero tokens.

Finds code related to the task by scoring the project map (paths, symbols,
doc comments, imports). Produces `.agentguard/generated/task-context.json`:
a bounded candidate list with per-file reasons, related dependency files, and
warnings. It never copies source contents into the context.

**Receives:** project map + task description.
**Produces:** compact task context.

A low-cost agent MAY re-rank or extend discovery when deterministic
confidence is weak (few/no candidates), but is never invoked automatically.
Whoever consumes the context must inspect the actual source files — the
context is a pointer, not a substitute.
