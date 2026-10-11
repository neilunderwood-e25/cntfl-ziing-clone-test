import { makeByIdFetcher } from "@/lib/cms/contentful";
import { CTAS_FRAGMENTS } from "../fragments/ctas";

/** Full Ctas entries by sys.id, for the enrichment pass (lib/content/pages.ts). */
export const getCtasByIds = makeByIdFetcher("ctas", "CtasFields", CTAS_FRAGMENTS);
