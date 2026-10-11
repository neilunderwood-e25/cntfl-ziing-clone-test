"use client";

import { useId, useRef } from "react";
import { useFancyboxVideo } from "@/components/common/video/fancybox";
import { fieldTag } from "@/lib/live-preview/field-tags";
import { resolveButtonLink } from "./link";
import type { ButtonProps } from "./types";

/**
 * Styleguide contract (styles/util/_buttons.css):
 *   <div class="btn btn--{id}"><a class="btn__link"><span class="label"/><span class="btn__icon"/></a></div>
 * Glyphs, typography and hover geometry come from the styleguide; nothing is
 * duplicated here.
 */
const PRIMARY_APPEARANCE: Record<string, string> = {
  Black: "btn--primary btn--primary-black",
  Blue: "btn--primary btn--primary-blue",
  "Light Blue": "btn--primary btn--primary-light-blue",
  Orange: "btn--primary btn--primary-orange",
  Yellow: "btn--primary btn--primary-yellow",
};

const SECONDARY_APPEARANCE: Record<string, string> = {
  Black: "btn--arrow btn--arrow-black",
  Blue: "btn--arrow btn--arrow-blue",
};

const LINK_APPEARANCE: Record<string, string> = {
  Black: "btn--link btn--link-black",
};

/**
 * The tertiary CTA: label + arrow. Blue is the ONLY alternative colorway, so
 * it is matched outright — Black is the default and every other authored
 * colour (including one the family never drew) falls to it rather than
 * rendering an undrawn colorway.
 */
function linkArrowAppearance(color?: string | null): string {
  return color === "Blue"
    ? "btn--link-arrow btn--link-arrow-blue"
    : "btn--link-arrow btn--link-arrow-black";
}

function appearanceFor(variant?: string | null, color?: string | null, videoPopup = false): string {
  if (videoPopup) return "btn--video";
  const key = color ?? "";
  if (variant === "Secondary") return SECONDARY_APPEARANCE[key] ?? "btn--arrow btn--arrow-blue";
  if (variant === "Link Text") return LINK_APPEARANCE[key] ?? "btn--link btn--link-black";
  if (variant === "Link Arrow") return linkArrowAppearance(color);
  return PRIMARY_APPEARANCE[key] ?? "btn--primary btn--primary-blue";
}

export function Button({ section, className }: Readonly<ButtonProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackGroup = useId();

  const link = resolveButtonLink(section);

  useFancyboxVideo(containerRef, link.popupUrl, link.popupVideo);

  if (!section?.label) return null;

  return (
    <div
      ref={containerRef}
      className={["btn", appearanceFor(section.buttonVariant, section.buttonColor, link.videoPopup), className]
        .filter(Boolean)
        .join(" ")}
    >
      {/*
        An entry with no authored destination resolves to no href, which makes
        this anchor neither a link nor focusable — but it would still light up
        on hover and show a pointer, advertising an interaction it cannot
        perform. `pointer-events-none` takes it out of hover entirely, so the
        styleguide's `:hover` rules never match and the cursor stays default.
      */}
      <a
        className={["btn__link", link.href ? null : "pointer-events-none"]
          .filter(Boolean)
          .join(" ")}
        href={link.href}
        aria-label={link.ariaLabel}
        target={link.target}
        rel={link.rel}
        data-fancybox={link.popupUrl ? `video-${section.sys?.id ?? fallbackGroup}` : undefined}
        data-type={link.isUploadedFile ? "html5video" : undefined}
      >
        <span className="label" {...fieldTag(section, "label")}>
          {section.label}
        </span>
        <span className="btn__icon" aria-hidden="true" />
      </a>
    </div>
  );
}
