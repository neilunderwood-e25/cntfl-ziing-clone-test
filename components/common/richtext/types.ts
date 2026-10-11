import type { PreviewFieldTag } from "@/lib/live-preview/field-tags";

/** A Contentful rich-text field exactly as the page query selects it. */
export type RichTextField = {
  json?: unknown;
  links?: unknown;
};

export type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export type RichTextProps = {
  field?: RichTextField | null;
  /** Optional wrapper class so layout stays with the calling section. */
  className?: string;
  /** Presentation class applied to paragraph nodes. */
  paragraphClassName?: string;
  /** Renders every heading node as this tag, whatever level the author picked. */
  headingTag?: HeadingTag;
  /**
   * Inspector-mode tag for the field (`fieldTag(record, "body")`). Applied to
   * the wrapper when there is a `className`; without one, to the document's
   * only block when it renders a single element (a one-line headline).
   * Otherwise there is no element to carry it — tag the caller's own.
   */
  tag?: PreviewFieldTag;
};
