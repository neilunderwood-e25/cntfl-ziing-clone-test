import { cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { documentToReactComponents, type Options, type RenderNode } from "@contentful/rich-text-react-renderer";
import {
  BLOCKS,
  INLINES,
  MARKS,
  type Block,
  type Document,
  type Inline,
  type Text,
} from "@contentful/rich-text-types";
import { Button } from "@/components/common/button";
import type { ButtonData } from "@/components/common/button/types";
import { Image } from "@/components/common/image";
import type { AssetData } from "@/components/common/image/types";
import { pageHref } from "@/lib/page-routes";
import type { HeadingTag, RichTextProps } from "./types";

/**
 * Renders a Contentful rich-text document through Contentful's own React
 * renderer (`@contentful/rich-text-react-renderer`); the overrides below carry
 * the site's markup. Headings emit their semantic tag so the styleguide's base
 * typography applies; everything else uses styleguide utility classes.
 * Embedded assets are rendered through the common Image renderer rather than
 * a second image implementation.
 */
type RichTextNode = Block | Inline | Text;

type LinkGroups = {
  entries?: unknown;
  assets?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The field's `json` arrives untyped. The renderer assumes a well-formed tree
 * (every text node has `marks`, every other node `content`), so rebuild it
 * into one: malformed children are dropped instead of crashing the page.
 */
function toNode(value: unknown): RichTextNode | null {
  if (!isRecord(value) || typeof value.nodeType !== "string") return null;
  const data = isRecord(value.data) ? value.data : {};

  if (value.nodeType === "text") {
    const marks = Array.isArray(value.marks)
      ? value.marks.filter((mark): mark is Text["marks"][number] => isRecord(mark) && typeof mark.type === "string")
      : [];
    return { nodeType: "text", value: typeof value.value === "string" ? value.value : "", marks, data };
  }

  const content = Array.isArray(value.content)
    ? value.content.map(toNode).filter((node): node is RichTextNode => node !== null)
    : [];
  return { nodeType: value.nodeType, data, content } as Block | Inline;
}

function toDocument(value: unknown): Document | null {
  const node = toNode(value);
  return node && node.nodeType !== "text" ? (node as Document) : null;
}

function targetId(node: RichTextNode): string | undefined {
  const target = isRecord(node.data.target) ? node.data.target : undefined;
  const sys = target && isRecord(target.sys) ? target.sys : undefined;
  return typeof sys?.id === "string" ? sys.id : undefined;
}

function linkedRecord(group: unknown, slot: string, id?: string): Record<string, unknown> | null {
  if (!id || !isRecord(group)) return null;
  const list = group[slot];
  if (!Array.isArray(list)) return null;
  const found = list.find((item) => isRecord(item) && isRecord(item.sys) && item.sys.id === id);
  return isRecord(found) ? found : null;
}

function textOf(node: RichTextNode): string {
  if (node.nodeType === "text") return node.value;
  return node.content.map(textOf).join("");
}

/**
 * A `hyperlink` node is Contentful's "link to URL" — the external link; site
 * pages are `entry-hyperlink`s. An absolute web URL leaves the site, so it
 * opens in a new tab; a rooted path, fragment, mailto: or tel: does not.
 */
const EXTERNAL_URI = /^(?:https?:)?\/\//i;
const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

function isExternalUri(uri: string): boolean {
  return EXTERNAL_URI.test(uri);
}

/** Authors often leave a trailing empty paragraph; it must not reserve space. */
function isEmptyBlock(node: Block | Inline): boolean {
  if (textOf(node).trim() !== "") return false;
  return !node.content.some((child) => child.nodeType !== "text");
}

/** The Button an `embedded-entry-block` points at; null for anything else. */
function embeddedButton(node: RichTextNode, links: LinkGroups): ButtonData | null {
  if (node.nodeType !== BLOCKS.EMBEDDED_ENTRY) return null;
  const entry = linkedRecord(links.entries, "block", targetId(node));
  return entry?.__typename === "Button" ? (entry as ButtonData) : null;
}

/**
 * Adjacent embedded Buttons are one CTA group, laid out like every section's
 * button row (see ctas/cta, content-side-by-side/intro-deck): stacked on
 * mobile, a wrapping row from `md`. `gap` spaces them 10px apart either way,
 * so the run reads the same whichever axis it falls on.
 */
const BUTTON_GROUP =
  "flex max-w-full flex-col items-start gap-4xs md:flex-row md:flex-wrap md:items-center";

/**
 * The renderer's children, in document order, with each run of embedded
 * Buttons collapsed into one group. Authors add a second CTA as a second
 * embed, so the run — not the single node — is what carries the layout. The
 * renderer hands children over index-aligned with `node.content`.
 */
function withButtonGroups(node: Block | Inline, children: ReactNode, links: LinkGroups): ReactNode[] {
  const rendered = Array.isArray(children) ? children : [children];
  const grouped: ReactNode[] = [];

  for (let index = 0; index < node.content.length; index++) {
    const button = embeddedButton(node.content[index], links);
    if (!button) {
      grouped.push(rendered[index]);
      continue;
    }

    const start = index;
    const run = [button];
    while (index + 1 < node.content.length) {
      const adjacent = embeddedButton(node.content[index + 1], links);
      if (!adjacent) break;
      run.push(adjacent);
      index++;
    }
    grouped.push(
      <div key={start} className={BUTTON_GROUP}>
        {run.map((entry, offset) => (
          <Button key={entry.sys?.id ?? `${start}.${offset}`} section={entry} />
        ))}
      </div>,
    );
  }

  return grouped;
}

/** Renders the node's children with no element of its own. */
function passThrough(_node: Block | Inline, children: ReactNode): ReactNode {
  return <>{children}</>;
}

function renderOptions(links: LinkGroups, paragraphClassName: string, headingTag?: HeadingTag): Options {
  // A forced level replaces every authored heading level (the caller styles it).
  // Typed as one map: the two shapes are a union, and spreading that union
  // makes the keys only one shape has `undefined`, which RenderNode rejects.
  const headings: RenderNode = headingTag
    ? {
        [BLOCKS.HEADING_1]: (_node: Block | Inline, children: ReactNode) => createElement(headingTag, null, children),
        [BLOCKS.HEADING_2]: (_node: Block | Inline, children: ReactNode) => createElement(headingTag, null, children),
        [BLOCKS.HEADING_3]: (_node: Block | Inline, children: ReactNode) => createElement(headingTag, null, children),
        [BLOCKS.HEADING_4]: (_node: Block | Inline, children: ReactNode) => createElement(headingTag, null, children),
        [BLOCKS.HEADING_5]: (_node: Block | Inline, children: ReactNode) => createElement(headingTag, null, children),
        [BLOCKS.HEADING_6]: (_node: Block | Inline, children: ReactNode) => createElement(headingTag, null, children),
      }
    : {
        [BLOCKS.HEADING_5]: (_node: Block | Inline, children: ReactNode) => <h5 className="header-4">{children}</h5>,
        [BLOCKS.HEADING_6]: (_node: Block | Inline, children: ReactNode) => <h6 className="header-4">{children}</h6>,
      };

  return {
    renderMark: {
      [MARKS.BOLD]: (text) => <strong>{text}</strong>,
      [MARKS.ITALIC]: (text) => <em>{text}</em>,
    },
    renderNode: {
      // Embeds sit at the root or inside a list item, so those are the two
      // places a Button run can form.
      [BLOCKS.DOCUMENT]: (node, children) => withButtonGroups(node, children, links),
      [BLOCKS.LIST_ITEM]: (node, children) => <li>{withButtonGroups(node, children, links)}</li>,
      [BLOCKS.PARAGRAPH]: (node, children) =>
        isEmptyBlock(node) ? null : <p className={paragraphClassName}>{children}</p>,
      ...headings,
      [BLOCKS.UL_LIST]: (_node, children) => (
        <ul className="flex flex-col gap-5xs list-disc pl-2xs text-left">{children}</ul>
      ),
      [BLOCKS.OL_LIST]: (_node, children) => (
        <ol className="flex flex-col gap-5xs list-decimal pl-2xs text-left">{children}</ol>
      ),
      [BLOCKS.QUOTE]: (_node, children) => (
        <blockquote className="border-l-2 border-light-blue pl-3xs">{children}</blockquote>
      ),
      [BLOCKS.HR]: () => <hr className="border-gray" />,
      [INLINES.HYPERLINK]: (node, children) => {
        const uri = typeof node.data.uri === "string" ? node.data.uri.trim() : undefined;
        return uri ? (
          <a className="underline" href={uri} {...(isExternalUri(uri) ? NEW_TAB : {})}>
            {children}
          </a>
        ) : (
          <>{children}</>
        );
      },
      [INLINES.ENTRY_HYPERLINK]: (node, children) => {
        const entry = linkedRecord(links.entries, "hyperlink", targetId(node));
        const url = pageHref(entry) ?? undefined;
        return url ? (
          <a className="underline" href={url}>
            {children}
          </a>
        ) : (
          <>{children}</>
        );
      },
      [INLINES.ASSET_HYPERLINK]: (node, children) => {
        const asset = linkedRecord(links.assets, "hyperlink", targetId(node));
        const url = typeof asset?.url === "string" ? asset.url : undefined;
        return url ? (
          <a className="underline" href={url}>
            {children}
          </a>
        ) : (
          <>{children}</>
        );
      },
      /**
       * An embedded entry is a CTA: the only entry type the renderer consumes
       * is `Button`, selected by GET_RICH_TEXT_ENTRIES (ZING-1004). Anything
       * else stays unrendered rather than guessing at a layout for it.
       *
       * Block only. `embedded-entry-inline` sits inside a paragraph and the
       * styleguide button is a `<div>`, which would close that `<p>` early and
       * silently break the copy around it.
       *
       * withButtonGroups replaces Buttons with their group, so this output
       * only shows where a parent does not group (not reachable for a valid
       * document).
       */
      [BLOCKS.EMBEDDED_ENTRY]: (node) => {
        const button = embeddedButton(node, links);
        return button ? <Button section={button} /> : null;
      },
      [BLOCKS.EMBEDDED_ASSET]: (node) => {
        const asset = linkedRecord(links.assets, "block", targetId(node));
        if (!asset) return null;
        // An embedded Asset has no Image entry around it, so its own
        // Description (else Title) is the alt text the CMS carries.
        const image = asset as AssetData;
        const alt = image.description?.trim() || image.title?.trim() || "";
        return <Image section={{ image }} alt={alt} className="h-auto w-full" />;
      },
      // The renderer's defaults for these print debug text ("type: … id: …");
      // nothing renders them yet, so they keep only their children.
      [BLOCKS.EMBEDDED_RESOURCE]: passThrough,
      [INLINES.EMBEDDED_ENTRY]: passThrough,
      [INLINES.EMBEDDED_RESOURCE]: passThrough,
      [INLINES.RESOURCE_HYPERLINK]: passThrough,
    },
  };
}

export function Richtext({
  field,
  className,
  paragraphClassName = "body-1",
  headingTag,
  tag,
}: RichTextProps) {
  const document = toDocument(field?.json);
  if (!document) return null;

  const rawLinks = field?.links;
  const links: LinkGroups = isRecord(rawLinks) ? (rawLinks as LinkGroups) : {};
  const content = documentToReactComponents(document, renderOptions(links, paragraphClassName, headingTag));

  // No wrapper to carry the inspector tag: when the document is one block
  // (the usual headline, eyebrow or name), that block's own element takes it.
  if (tag && !className) {
    const blocks = (Array.isArray(content) ? content : [content]).filter(
      (block): block is ReactElement<Record<string, unknown>> => isValidElement(block),
    );
    const [only] = blocks;
    if (blocks.length === 1 && typeof only.type === "string") return cloneElement(only, tag);
  }

  return className ? (
    <div className={className} {...tag}>
      {content}
    </div>
  ) : (
    <>{content}</>
  );
}
