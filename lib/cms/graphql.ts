/**
 * GraphQL authoring helpers — provider-neutral (any GraphQL CMS).
 *
 * Queries are sent as plain strings in the fetch POST body, so nothing parses
 * them into an AST at runtime. `gql` is an identity template tag that exists
 * purely so editors/GraphQL extensions light up (syntax highlighting,
 * validation) on these template literals — it keeps the `graphql` /
 * `graphql-tag` / Apollo runtime out of the bundle entirely.
 */
export function gql(strings: TemplateStringsArray, ...expressions: unknown[]): string {
  return strings.reduce(
    (acc, str, i) => acc + str + (i < expressions.length ? String(expressions[i]) : ""),
    "",
  );
}

/**
 * Compose an operation with its fragment dependencies into a single document
 * string, de-duplicating fragments included more than once. Keeps a query and
 * its fragments in lockstep while letting fragments be shared across queries.
 */
export function buildQuery(operation: string, fragments: string[] = []): string {
  const unique = Array.from(new Set(fragments.map((f) => f.trim()).filter(Boolean)));
  return [operation.trim(), ...unique].join("\n\n");
}
