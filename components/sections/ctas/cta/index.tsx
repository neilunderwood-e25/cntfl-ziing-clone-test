import { Button } from "@/components/common/button";
import type { ButtonData } from "@/components/common/button/types";
import { Image } from "@/components/common/image";
import { Richtext } from "@/components/common/richtext";
import Container from "@/components/ui/Container";
import { fieldTag } from "@/lib/live-preview/field-tags";
import type { CtasNavigationLinkData, CtasSection } from "../types";
import styles from "./style.module.css";

/** The CTA block's solid colour, keyed by the exact CMS `backgroundColor` value. */
const CARD_SURFACE: Record<string, string> = {
  Yellow: "bg-yellow",
  Blue: "bg-blue",
};

/** Over background media the block is the same colour at 96% opacity (ZING-320). */
const CARD_OVERLAY: Record<string, string> = {
  Yellow: "bg-yellow/96",
  Blue: "bg-blue/96",
};

/** Only Button entries are drawn as CTAs; the design has no Navigation Link treatment. */
function isButton(
  item: ButtonData | CtasNavigationLinkData | null | undefined,
): item is ButtonData {
  return item?.__typename === "Button";
}

export function Cta({ section }: { section: CtasSection }) {
  const { headline, description, backgroundMedia } = section;
  const buttons = (section.buttons ?? []).filter(isButton);
  const hasMedia = Boolean(backgroundMedia?.image?.url);
  const color = section.backgroundColor ?? "";

  const card = (
    <div
      className={[
        "relative mx-auto flex w-full flex-col items-center justify-center gap-2xs rounded-lg p-s text-center text-black lg:w-[83.06%] lg:gap-[42px]",
        hasMedia
          ? `${CARD_OVERLAY[color] ?? "bg-yellow/96"} lg:min-h-[439px] lg:px-5xl lg:py-4xl`
          : `${CARD_SURFACE[color] ?? "bg-yellow"} lg:p-5xl`,
      ].join(" ")}
    >
      <Richtext
        field={headline}
        tag={fieldTag(section, "headline")}
        paragraphClassName=""
        className={[
          "w-full *:font-semibold *:text-[40px] *:leading-[44px] *:tracking-[-0.4px] *:text-black lg:w-[95.38%] lg:*:text-size-60 lg:*:tracking-[-0.6px]",
          hasMedia ? "lg:*:leading-[66px]" : "lg:*:leading-[64.8px]",
        ].join(" ")}
      />
      <Richtext
        field={description}
        tag={fieldTag(section, "description")}
        className="w-full text-black lg:w-[95.38%]"
        paragraphClassName="body-2 lg:body-1"
      />
      {buttons.length > 0 ? (
        <div
          className="flex max-w-full flex-col items-center gap-2xs lg:flex-row lg:flex-wrap lg:justify-center"
          {...fieldTag(section, "buttons")}
        >
          {buttons.map((button, index) => (
            <Button key={button.sys?.id ?? index} section={button} />
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      data-section="ctas-cta"
      id={section.sectionId ?? undefined}
      className="py-3xl lg:py-11xl"
    >
      <Container>
        {hasMedia ? (
          <div className="relative flex w-full items-center justify-center overflow-hidden px-2xs py-xl lg:min-h-[649px] lg:rounded-lg lg:px-0 lg:py-[105px]">
            <div
              aria-hidden="true"
              className={`absolute inset-x-0 top-[-8%] h-[116%] ${styles.parallax}`}
              {...fieldTag(section, "backgroundMedia")}
            >
              <Image
                section={backgroundMedia}
                decorative
                sizes="(min-width: 1500px) 1440px, 100vw"
                className="h-full w-full object-cover"
              />
            </div>
            {card}
          </div>
        ) : (
          card
        )}
      </Container>
    </section>
  );
}
