/**
 * Contentful GraphQL returns every multi-reference field as a collection:
 * `fooCollection { items [ … ] }`. That shape is noisy to consume in
 * components, so we normalize it once, right after fetching, into plain
 * arrays keyed by the field's real name (`foo`).
 *
 * Generic: any `*Collection` key whose value has an `items` array is
 * flattened, so new sections/fields need no bespoke normalization code.
 * Unresolvable links arrive as `null` items — they are dropped here so
 * components never see holes. Single references and assets are already
 * direct objects in Contentful's schema and pass through untouched.
 */
type Json = unknown;

function isCollection(value: unknown): value is { items: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    Array.isArray((value as { items: unknown }).items)
  );
}

export function flattenCollections<T = Json>(input: Json): T {
  if (Array.isArray(input)) {
    return input.map((item) => flattenCollections(item)) as T;
  }

  if (typeof input === "object" && input !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key.endsWith("Collection") && isCollection(value)) {
        out[key.slice(0, -"Collection".length)] = value.items
          .filter((item) => item !== null && item !== undefined)
          .map((item) => flattenCollections(item));
      } else {
        out[key] = flattenCollections(value);
      }
    }
    return out as T;
  }

  return input as T;
}
