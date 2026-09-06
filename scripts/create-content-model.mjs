/**
 * One-time seeder: creates the boilerplate's sample content model in a
 * Contentful space via the Content Management API, and (with --with-entries)
 * published sample pages for both Hero variants.
 *
 *   node scripts/create-content-model.mjs                # content types only
 *   node scripts/create-content-model.mjs --with-entries # + home page + publish
 *
 * Reads .env.local: CONTENTFUL_SPACE_ID, CONTENTFUL_MANAGEMENT_TOKEN,
 * optional CONTENTFUL_ENVIRONMENT (default master). Existing content
 * types/entries are left untouched (found → skipped), so re-running is safe.
 *
 * Model (mirrors the field shapes the sample code queries — keep
 * lib/content/queries/fragments/hero-banner.ts in sync if you change it;
 * structure follows a proven production pattern: the page stores its FULL
 * public path in `url` and composes section references):
 *   flexiblePage: title, url (unique), sections → [heroBanner]
 *   heroBanner:   title, frontendComponent, heading, subHeading, image (asset), ctaLabel, ctaUrl
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WITH_ENTRIES = process.argv.includes("--with-entries");

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

const SPACE = process.env.CONTENTFUL_SPACE_ID;
const MGMT_TOKEN = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";

if (!SPACE || !MGMT_TOKEN) {
  console.error("✗ CONTENTFUL_SPACE_ID and CONTENTFUL_MANAGEMENT_TOKEN are required in .env.local");
  process.exit(1);
}

const BASE = `https://api.contentful.com/spaces/${SPACE}/environments/${ENVIRONMENT}`;

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${MGMT_TOKEN}`,
      "content-type": "application/vnd.contentful.management.v1+json",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const CONTENT_TYPES = [
  {
    id: "heroBanner",
    body: {
      name: "Hero Banner",
      description: "[role:section] SAMPLE Hero family — replace per project",
      displayField: "title",
      fields: [
        { id: "title", name: "Title", type: "Symbol", required: true },
        {
          id: "frontendComponent",
          name: "Frontend Component",
          type: "Symbol",
          required: true,
          validations: [{ in: ["heroWithBanner", "heroWithCTA"] }],
        },
        { id: "heading", name: "Heading", type: "Symbol" },
        { id: "subHeading", name: "Sub Heading", type: "Symbol" },
        { id: "image", name: "Image", type: "Link", linkType: "Asset" },
        { id: "ctaLabel", name: "CTA Label", type: "Symbol" },
        { id: "ctaUrl", name: "CTA URL", type: "Symbol" },
      ],
    },
  },
  {
    id: "flexiblePage",
    body: {
      name: "Flexible Page",
      description: "Housing page type — url stores the FULL public path (routing contract)",
      displayField: "title",
      fields: [
        { id: "title", name: "Title", type: "Symbol", required: true },
        {
          id: "url",
          name: "URL",
          type: "Symbol",
          required: true,
          validations: [{ unique: true }],
        },
        {
          id: "sections",
          name: "Sections",
          type: "Array",
          items: {
            type: "Link",
            linkType: "Entry",
            validations: [{ linkContentType: ["heroBanner"] }],
          },
        },
      ],
    },
  },
];

async function createContentTypes() {
  for (const { id, body } of CONTENT_TYPES) {
    const existing = await api("GET", `/content_types/${id}`);
    if (existing.status === 200) {
      if (id === "heroBanner") {
        const field = existing.json.fields?.find((field) => field.id === "frontendComponent");
        const allowed = field?.validations?.find((validation) => validation.in)?.in;
        if (
          field?.type !== "Symbol" || field.disabled || field.omitted ||
          (allowed && !["heroWithBanner", "heroWithCTA"].every((value) => allowed.includes(value)))
        ) {
          console.error(
            "✗ Existing heroBanner needs a frontendComponent Symbol field allowing heroWithBanner and heroWithCTA. " +
            "Update/publish the model and populate existing entries manually; see docs/playbooks/contentful.md §3. " +
            "No existing model was changed.",
          );
          process.exit(1);
        }
      }
      console.log(`• content type already exists, skipped: ${id}`);
      continue;
    }
    if (existing.status !== 404) {
      console.error(`✗ cannot inspect ${id} (HTTP ${existing.status}); stopping before any create attempt`);
      process.exit(1);
    }

    const created = await api("PUT", `/content_types/${id}`, body);
    if (created.status !== 201) {
      console.error(`✗ failed creating ${id} (HTTP ${created.status}):`, JSON.stringify(created.json));
      process.exit(1);
    }

    const activated = await api("PUT", `/content_types/${id}/published`, null, {
      "x-contentful-version": String(created.json.sys.version),
    });
    if (activated.status !== 200) {
      console.error(`✗ failed activating ${id} (HTTP ${activated.status}):`, JSON.stringify(activated.json));
      process.exit(1);
    }
    console.log(`✓ content type created + activated: ${id}`);
  }
}

async function getDefaultLocale() {
  const { status, json } = await api("GET", "/locales");
  if (status !== 200) return "en-US";
  return json.items?.find((l) => l.default)?.code ?? "en-US";
}

async function findEntry(contentType, field, value) {
  const query = `content_type=${contentType}&fields.${field}=${encodeURIComponent(value)}&limit=1`;
  const { status, json } = await api("GET", `/entries?${query}`);
  if (status === 200 && json.items?.length) return json.items[0];
  return null;
}

async function createEntry(contentType, matchField, fields, locale) {
  const localized = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, { [locale]: value }]),
  );

  const existing = await findEntry(contentType, matchField, fields[matchField]);
  if (existing) {
    console.log(`• entry already exists, reusing: ${contentType} "${fields.title}" (${existing.sys.id})`);
    return existing;
  }

  const { status, json } = await api("POST", "/entries", { fields: localized }, {
    "x-contentful-content-type": contentType,
  });
  if (status !== 201) {
    console.error(`✗ failed creating entry in ${contentType} (HTTP ${status}):`, JSON.stringify(json));
    process.exit(1);
  }
  console.log(`✓ entry created: ${contentType} "${fields.title}" (${json.sys.id})`);
  return json;
}

async function publishEntry(entry) {
  const { sys } = entry;
  if (sys.publishedVersion && sys.version === sys.publishedVersion + 1) {
    console.log(`• already published: ${sys.id}`);
    return;
  }
  const { status, json } = await api("PUT", `/entries/${sys.id}/published`, null, {
    "x-contentful-version": String(sys.version),
  });
  if (status !== 200) {
    console.error(`✗ publish failed for ${sys.id} (HTTP ${status}):`, JSON.stringify(json));
    process.exit(1);
  }
  console.log(`✓ published: ${sys.id}`);
}

await createContentTypes();

if (WITH_ENTRIES) {
  const locale = await getDefaultLocale();

  const hero = await createEntry(
    "heroBanner",
    "title",
    {
      title: "Sample Hero Banner",
      frontendComponent: "heroWithBanner",
      heading: "Welcome to the boilerplate",
      subHeading: "Full-SSR, CDN-cached, one query per page.",
      ctaLabel: "Read the docs",
      ctaUrl: "/docs",
    },
    locale,
  );
  await publishEntry(hero);

  const page = await createEntry(
    "flexiblePage",
    "url",
    {
      title: "Home",
      url: "/",
      sections: [{ sys: { type: "Link", linkType: "Entry", id: hero.sys.id } }],
    },
    locale,
  );
  await publishEntry(page);

  const ctaHero = await createEntry(
    "heroBanner",
    "title",
    {
      title: "Sample Hero With CTA",
      frontendComponent: "heroWithCTA",
      heading: "One content model, another layout",
      subHeading: "The Hero family selects this variant using frontendComponent.",
      ctaLabel: "Back to the banner",
      ctaUrl: "/",
    },
    locale,
  );
  await publishEntry(ctaHero);

  const ctaPage = await createEntry(
    "flexiblePage",
    "url",
    {
      title: "CTA Hero sample",
      url: "/sample-cta",
      sections: [{ sys: { type: "Link", linkType: "Entry", id: ctaHero.sys.id } }],
    },
    locale,
  );
  await publishEntry(ctaPage);

  console.log("\nDone. Start the app (npm run dev) and open / and /sample-cta.");
} else {
  console.log("\nContent types done. Re-run with --with-entries to seed + publish both sample pages.");
}
