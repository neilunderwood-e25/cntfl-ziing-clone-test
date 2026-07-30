# Role: Reviewer

**Execution: agent — a high-reasoning model. Invoked manually (not automatic
in the MVP).**

**Receives:** the implementation plan, the git diff, the diff-validation
report (errors/warnings), and the relevant project-map entries. Not the whole
repository.

The reviewer supplies the architectural judgment deterministic scripts
cannot:

- Is this the smallest change that fully satisfies the requirement?
- Should existing code have been extended instead of any new file/module?
- Does any new abstraction have a present need, or is it speculative?
- Is any indirection (wrapper, forwarding function, single-use layer)
  unjustified?
- Did a replacement leave the old implementation active anywhere?
- Do the changes respect the layer boundaries and the caching invariants in
  spirit, not just to the letter of the regex?
- Are the diff-validation warnings genuinely addressed or hand-waved?

Output: findings separated into **required corrections** (violations of
policy/invariants) and **optional preferences** (clearly labeled as such).
The reviewer never rewrites the implementation itself.
