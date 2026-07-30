/**
 * One-time seeder: creates the boilerplate's sample content model in a
 * Contentstack stack via the Management API, and (with --with-entries) a
 * published home page so the app renders end-to-end immediately.
 *
 *   node scripts/create-content-model.mjs               # content types only
 *   node scripts/create-content-model.mjs --with-entries # + home page + publish
 *
 * Reads .env.local: CONTENTSTACK_API_KEY, CONTENTSTACK_MANAGEMENT_TOKEN,
 * CONTENTSTACK_ENVIRONMENT (for publishing), optional CONTENTSTACK_BRANCH /
 * CONTENTSTACK_API_HOST. Existing content types/entries are left untouched
 * (409/422 duplicates are reported and skipped), so re-running is safe.
 *
 * Model (mirrors the field shapes the sample code queries — keep
 * lib/content/queries/fragments/hero-banner.ts in sync if you change it):
 *   flexible_page: title, url (FULL public path — the routing contract),
 *                  sections → [hero_banner]
 *   hero_banner:   title, heading, sub_heading, image (file), cta (link)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WITH_ENTRIES = process.argv.includes("--with-entries");
const LOCALE = "en-us";

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8");
  } catch {
    console.error("✗ .env.local not found — copy .env.example and fill it in first.");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

loadEnvLocal();

const API_KEY = process.env.CONTENTSTACK_API_KEY;
const MGMT_TOKEN = process.env.CONTENTSTACK_MANAGEMENT_TOKEN;
const ENVIRONMENT = process.env.CONTENTSTACK_ENVIRONMENT;
const BRANCH = process.env.CONTENTSTACK_BRANCH || "main";
const HOST = process.env.CONTENTSTACK_API_HOST || "api.contentstack.io";

if (!API_KEY || !MGMT_TOKEN) {
  console.error("✗ CONTENTSTACK_API_KEY and CONTENTSTACK_MANAGEMENT_TOKEN are required in .env.local");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`https://${HOST}/v3${path}`, {
    method,
    headers: {
      api_key: API_KEY,
      authorization: MGMT_TOKEN,
      branch: BRANCH,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const DEFAULT_TITLE_FIELD = {
  data_type: "text",
  display_name: "Title",
  uid: "title",
  field_metadata: { _default: true, version: 3 },
  mandatory: true,
  unique: true,
  multiple: false,
  non_localizable: false,
};

const CONTENT_TYPES = [
  {
    content_type: {
      title: "Hero Banner",
      uid: "hero_banner",
      options: { is_page: false, singleton: false, title: "title", sub_title: [] },
      schema: [
        DEFAULT_TITLE_FIELD,
        { data_type: "text", display_name: "Heading", uid: "heading", multiple: false, mandatory: false, unique: false, non_localizable: false, field_metadata: { description: "", default_value: "", version: 3 } },
        { data_type: "text", display_name: "Sub Heading", uid: "sub_heading", multiple: false, mandatory: false, unique: false, non_localizable: false, field_metadata: { description: "", default_value: "", version: 3 } },
        { data_type: "file", display_name: "Image", uid: "image", multiple: false, mandatory: false, unique: false, non_localizable: false, field_metadata: { description: "", rich_text_type: "standard" } },
        { data_type: "link", display_name: "CTA", uid: "cta", multiple: false, mandatory: false, unique: false, non_localizable: false, field_metadata: { description: "", default_value: { title: "", url: "" } } },
      ],
    },
  },
  {
    content_type: {
      title: "Flexible Page",
      uid: "flexible_page",
      // is_page gives the entry a URL field; entries store the FULL public
      // path there (the routing contract — see AGENTS.md).
      options: { is_page: true, singleton: false, title: "title", sub_title: [], url_pattern: "/:title", url_prefix: "/" },
      schema: [
        DEFAULT_TITLE_FIELD,
        { data_type: "text", display_name: "URL", uid: "url", field_metadata: { _default: true, version: 3 }, multiple: false, unique: false, mandatory: false, non_localizable: false },
        { data_type: "reference", display_name: "Sections", uid: "sections", reference_to: ["hero_banner"], field_metadata: { ref_multiple: true, ref_multiple_content_types: true, default_value: null }, mandatory: false, multiple: false, unique: false, non_localizable: false },
      ],
    },
  },
];

async function createContentTypes() {
  for (const body of CONTENT_TYPES) {
    const uid = body.content_type.uid;
    const { status, json } = await api("POST", "/content_types", body);
    if (status === 201) console.log(`✓ content type created: ${uid}`);
    else if (status === 409 || json?.error_code === 115)
      console.log(`• content type already exists, skipped: ${uid}`);
    else {
      console.error(`✗ failed creating ${uid} (HTTP ${status}):`, JSON.stringify(json));
      process.exit(1);
    }
  }
}

async function createEntry(ctUid, entry) {
  const { status, json } = await api("POST", `/content_types/${ctUid}/entries?locale=${LOCALE}`, { entry });
  if (status === 201) {
    console.log(`✓ entry created: ${ctUid} "${entry.title}" (${json.entry.uid})`);
    return json.entry.uid;
  }
  if (json?.error_code === 119 && JSON.stringify(json).includes("unique")) {
    // Duplicate title — find the existing entry instead.
    const found = await api("GET", `/content_types/${ctUid}/entries?locale=${LOCALE}&query=${encodeURIComponent(JSON.stringify({ title: entry.title }))}`);
    const existing = found.json?.entries?.[0];
    if (existing) {
      console.log(`• entry already exists, reusing: ${ctUid} "${entry.title}" (${existing.uid})`);
      return existing.uid;
    }
  }
  console.error(`✗ failed creating entry in ${ctUid} (HTTP ${status}):`, JSON.stringify(json));
  process.exit(1);
}

async function publishEntry(ctUid, entryUid) {
  if (!ENVIRONMENT) {
    console.error("✗ CONTENTSTACK_ENVIRONMENT required to publish");
    process.exit(1);
  }
  const { status, json } = await api("POST", `/content_types/${ctUid}/entries/${entryUid}/publish`, {
    entry: { environments: [ENVIRONMENT], locales: [LOCALE] },
  });
  if (status === 200 || status === 201) console.log(`✓ published: ${ctUid}/${entryUid} → ${ENVIRONMENT}`);
  else {
    console.error(`✗ publish failed for ${ctUid}/${entryUid} (HTTP ${status}):`, JSON.stringify(json));
    process.exit(1);
  }
}

await createContentTypes();

if (WITH_ENTRIES) {
  const heroUid = await createEntry("hero_banner", {
    title: "Sample Hero Banner",
    heading: "Welcome to the boilerplate",
    sub_heading: "Full-SSR, CDN-cached, one query per page.",
    cta: { title: "Read the docs", href: "/docs" },
  });
  await publishEntry("hero_banner", heroUid);

  const pageUid = await createEntry("flexible_page", {
    title: "Home",
    url: "/",
    sections: [{ uid: heroUid, _content_type_uid: "hero_banner" }],
  });
  await publishEntry("flexible_page", pageUid);

  console.log("\nDone. Start the app (npm run dev) and open http://localhost:3000/");
} else {
  console.log("\nContent types done. Re-run with --with-entries to seed + publish a home page.");
}
