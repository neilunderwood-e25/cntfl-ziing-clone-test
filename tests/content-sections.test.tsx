import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { buildSchema, graphql } from "graphql";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionRenderer } from "@/components/sections/registry";
import { HeroFrontendComponent, SectionTypename } from "@/lib/content/enum";
import { getPageByUrl } from "@/lib/content/pages";
import { getPreviewContext } from "@/lib/cms";
import type { Section } from "@/types/contentful";

// A schema, not a canned response: executing the application's actual query
// catches missing fields and broken fragment composition before rendering.
const schema = buildSchema(`
  type Sys { id: ID! }
  type Asset { url: String title: String description: String width: Int height: Int }
  type HeroBanner {
    sys: Sys! frontendComponent: String heading: String subHeading: String
    image: Asset ctaLabel: String ctaUrl: String
  }
  union SectionItem = HeroBanner
  type SectionCollection { items: [SectionItem] }
  type FlexiblePage { sys: Sys! title: String url: String sectionsCollection(limit: Int): SectionCollection }
  type FlexiblePageCollection { items: [FlexiblePage] }
  input FlexiblePageFilter { url: String }
  type Query {
    flexiblePageCollection(where: FlexiblePageFilter, limit: Int, preview: Boolean): FlexiblePageCollection
  }
`);

const banner: Section = {
  __typename: SectionTypename.Hero,
  sys: { id: "banner" },
  frontendComponent: HeroFrontendComponent.HeroWithBanner,
  heading: "Published banner",
  subHeading: "Content from the page query",
  ctaLabel: "Explore",
  ctaUrl: "/explore",
};

const cta: Section = {
  ...banner,
  sys: { id: "cta" },
  frontendComponent: HeroFrontendComponent.HeroWithCTA,
  heading: "Published CTA",
};

function fixtureEnvironment(t: TestContext) {
  const previous = { ...process.env };
  Object.assign(process.env, {
    CMS_PROVIDER: "contentful",
    CONTENTFUL_SPACE_ID: "fixture-space",
    CONTENTFUL_ENVIRONMENT: "fixture-environment",
    CONTENTFUL_GRAPHQL_HOST: "graphql.contentful.com",
    CONTENTFUL_DELIVERY_TOKEN: "fixture-delivery",
    CONTENTFUL_PREVIEW_TOKEN: "fixture-preview",
    CONTENTFUL_PREVIEW_SECRET: "fixture-secret",
  });
  t.after(() => { process.env = previous; });
}

function mockContentful(t: TestContext) {
  fixtureEnvironment(t);
  const calls: Array<{ endpoint: string; token: string | null; cache?: RequestCache }> = [];
  t.mock.method(globalThis, "fetch", async (input: string, options: RequestInit) => {
    calls.push({
      endpoint: String(input),
      token: new Headers(options.headers).get("authorization"),
      cache: options.cache,
    });
    const { query, variables } = JSON.parse(String(options.body));
    const result = await graphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        flexiblePageCollection: ({ where, preview }: { where: { url: string }; preview: boolean }) => ({
          items: where.url === "/missing" ? [] : [{
            sys: { id: "page" },
            title: preview ? "Draft page" : "Published page",
            url: where.url,
            sectionsCollection: { items: [
              { ...banner, heading: preview ? "Draft banner" : banner.heading },
              null,
              cta,
            ] },
          }],
        }),
      },
    });
    assert.equal(result.errors, undefined, JSON.stringify(result.errors));
    return Response.json(result);
  });
  return calls;
}

test("one page query normalizes content and dispatches two layouts of the same family", async (t) => {
  const calls = mockContentful(t);
  const page = await getPageByUrl("/example");
  assert.ok(page);
  assert.equal(page.url, "/example");
  assert.equal(page.sections.length, 2, "unresolvable links are removed by the existing normalizer");
  const html = renderToStaticMarkup(<SectionRenderer sections={page.sections} />);
  assert.match(html, /data-section="hero-banner"/);
  assert.match(html, /data-section="hero-with-cta"/);
  assert.match(html, /Published banner/);
  assert.match(html, /Published CTA/);
  assert.match(html, /href="\/explore"/);
  assert.ok(html.indexOf("Published banner") < html.indexOf("Published CTA"));
  assert.deepEqual(calls, [{
    endpoint: "https://graphql.contentful.com/content/v1/spaces/fixture-space/environments/fixture-environment",
    token: "Bearer fixture-delivery",
    cache: "no-store",
  }]);
});

test("the existing preview path selects draft content and the preview token", async (t) => {
  const calls = mockContentful(t);
  const preview = getPreviewContext({ preview: "fixture-secret" });
  assert.ok(preview);
  assert.equal(getPreviewContext({ preview: "wrong-secret" }), null);
  const page = await getPageByUrl("/example", preview);
  assert.ok(page);
  assert.equal(page.title, "Draft page");
  assert.match(renderToStaticMarkup(<SectionRenderer sections={page.sections} />), /Draft banner/);
  assert.equal(calls[0].token, "Bearer fixture-preview");
  assert.equal(calls[0].cache, "no-store");
});

test("a missing page stays null for the catch-all route's 404 handling", async (t) => {
  mockContentful(t);
  assert.equal(await getPageByUrl("/missing"), null);
});

test("unknown, missing, and incorrectly cased variants never silently render a default", () => {
  for (const frontendComponent of [undefined, null, "", "notBuilt", "HeroWithBanner", "heroWithBanner "]) {
    const html = renderToStaticMarkup(
      <SectionRenderer sections={[{ ...banner, frontendComponent }]} />,
    );
    assert.equal(html, "", `unexpected rendering for ${String(frontendComponent)}`);
  }
});

test("unknown types have a development marker and cannot resolve inherited object properties", (t) => {
  fixtureEnvironment(t);
  Object.assign(process.env, { NODE_ENV: "development" });
  for (const __typename of ["NotBuilt", "toString", "constructor", "__proto__"]) {
    assert.match(
      renderToStaticMarkup(<SectionRenderer sections={[{ __typename }]} />),
      /data-unknown-section=/,
    );
  }
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.equal(renderToStaticMarkup(<SectionRenderer sections={[{ __typename: "NotBuilt" }]} />), "");
});

test("optional content renders safely and the banner uses the asset description for alt text", () => {
  for (const frontendComponent of Object.values(HeroFrontendComponent)) {
    const html = renderToStaticMarkup(
      <SectionRenderer sections={[{ __typename: SectionTypename.Hero, frontendComponent }]} />,
    );
    assert.match(html, /data-section=/);
    assert.doesNotMatch(html, /<a |<img |<h1/);
  }
  const html = renderToStaticMarkup(<SectionRenderer sections={[{
    ...banner,
    image: { url: "/file.svg", title: "Internal media label", description: "A sample illustration", width: 32, height: 32 },
  }]} />);
  assert.match(html, /alt="A sample illustration"/);
  assert.doesNotMatch(html, /alt="Internal media label"/);
});

test("optional seeding aligns model values and sample pages without changing existing models", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "foundry-seed-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "scripts"));
  const seed = join(dir, "scripts", "create-content-model.mjs");
  writeFileSync(seed, readFileSync(new URL("../scripts/create-content-model.mjs", import.meta.url)));
  writeFileSync(join(dir, ".env.local"), "# Mock test; never connects to Contentful\n");
  const preload = join(dir, "mock-cma.mjs");
  const output = join(dir, "calls.json");
  writeFileSync(preload, `
    import { writeFileSync } from 'node:fs';
    const calls = [];
    let nextId = 0;
    globalThis.fetch = async (input, init) => {
      const url = new URL(input);
      if (url.origin !== 'https://api.contentful.com') throw new Error('Unexpected network target');
      const path = url.pathname.split('/environments/fixture-environment')[1];
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method, path, body, headers: init.headers });
      writeFileSync(process.env.MOCK_CALLS, JSON.stringify(calls));
      if (init.method === 'GET' && path.startsWith('/content_types/')) {
        if (process.env.MOCK_OLD_MODEL === 'yes') return Response.json({ fields: [{ id: 'heading', type: 'Symbol' }] });
        return Response.json({}, { status: 404 });
      }
      if (init.method === 'GET' && path === '/locales') return Response.json({ items: [{ default: true, code: 'en-US' }] });
      if (init.method === 'GET' && path === '/entries') return Response.json({ items: [] });
      if (init.method === 'PUT' && path.endsWith('/published')) return Response.json({});
      if (init.method === 'PUT' && path.startsWith('/content_types/')) return Response.json({ ...body, sys: { version: 1 } }, { status: 201 });
      if (init.method === 'POST' && path === '/entries') return Response.json({ ...body, sys: { id: 'entry-' + ++nextId, version: 1 } }, { status: 201 });
      throw new Error('Unexpected request: ' + init.method + ' ' + path);
    };
  `);
  const run = (oldModel: boolean) => spawnSync(process.execPath, ["--import", preload, seed, "--with-entries"], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      CONTENTFUL_SPACE_ID: "fixture-space",
      CONTENTFUL_ENVIRONMENT: "fixture-environment",
      CONTENTFUL_MANAGEMENT_TOKEN: "fixture-management",
      MOCK_CALLS: output,
      MOCK_OLD_MODEL: oldModel ? "yes" : "no",
    },
  });
  const fresh = run(false);
  assert.equal(fresh.status, 0, fresh.stderr);
  const calls = JSON.parse(readFileSync(output, "utf8")) as Array<{
    method: string; path: string;
    body: { fields?: Array<{ id: string; validations?: Array<{ in: string[] }> }> } & Record<string, unknown>;
    headers: Record<string, string>;
  }>;
  const model = calls.find((call) => call.method === "PUT" && call.path === "/content_types/heroBanner");
  const values = model?.body.fields?.find((field) => field.id === "frontendComponent")?.validations?.[0].in;
  assert.deepEqual(values, Object.values(HeroFrontendComponent));
  const entries = calls.filter((call) => call.method === "POST" && call.path === "/entries");
  const fields = entries.map((call) => call.body.fields as unknown as Record<string, Record<string, string>>);
  assert.deepEqual(fields.filter((field) => field.frontendComponent).map((field) => field.frontendComponent["en-US"]), values);
  assert.deepEqual(fields.filter((field) => field.url).map((field) => field.url["en-US"]), ["/", "/sample-cta"]);

  const old = run(true);
  assert.equal(old.status, 1);
  assert.match(old.stderr, /populate existing entries manually/);
  const oldCalls = JSON.parse(readFileSync(output, "utf8")) as Array<{ method: string }>;
  assert.ok(oldCalls.every((call) => call.method === "GET"), "incompatible existing models must not be rewritten");
});
