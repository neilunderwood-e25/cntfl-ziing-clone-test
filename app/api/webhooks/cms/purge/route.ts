import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { purgeCdns, PURGERS } from "@/lib/cache/purge";
import { getCms } from "@/lib/cms";

/**
 * CMS publish webhook → CDN purge chain.
 *
 * Provider-agnostic: the active adapter maps its own payload shape to purge
 * targets (`webhookToPurgeTargets`), and `purgeCdns()` runs whatever purgers
 * are registered — none in the boilerplate, so today this authenticates,
 * logs, and no-ops. Point the CMS webhook here from day one; purging starts
 * working the moment a CDN playbook registers a purger.
 *
 * STATUS CODE POLICY (a production lesson, kept as the safe default here):
 * return 200 for every authenticated, well-formed event, even when a
 * downstream purge fails. Some CMSs treat repeated 5xx as reason to DISABLE
 * THE WEBHOOK ENTIRELY — a far worse failure mode than one missed purge (the
 * stale-while-revalidate window is the backstop, and an editor can
 * re-publish). Failures surface via the structured error log (alert on
 * "[cms-purge-webhook] purge failure") and `ok: false` in the response body,
 * never via the HTTP status. The only 500 is a genuine server
 * misconfiguration (missing secret), which retrying can't cure.
 *
 * Auth: shared secret in `x-webhook-secret`, compared in constant time.
 * Configure the same value in the CMS webhook settings.
 */
export const dynamic = "force-dynamic";
// Headroom for purger retry/backoff once CDN purgers are registered.
export const maxDuration = 30;

function constantTimeEqual(a: string, b: string): boolean {
  // Hash both sides first so length differences don't short-circuit timing.
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const secret = process.env.CMS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[cms-purge-webhook] CMS_WEBHOOK_SECRET not configured", { requestId });
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!constantTimeEqual(provided, secret)) {
    console.warn("[cms-purge-webhook] unauthorized request", { requestId });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const targets = getCms().webhookToPurgeTargets(payload, req.headers);
  if (targets.tags.length === 0 && targets.urls.length === 0) {
    console.info("[cms-purge-webhook] non-purge event — skipped", { requestId });
    return NextResponse.json({ ok: true, skipped: true });
  }

  const results = await purgeCdns(targets);
  const failures = results.filter((r) => !r.ok);

  if (failures.length > 0) {
    // Error-level log is the alerting surface — the HTTP status stays 200.
    console.error("[cms-purge-webhook] purge failure", { requestId, targets, results });
    return NextResponse.json({ ok: false, degraded: true, targets, results });
  }

  console.info("[cms-purge-webhook] purge ok", {
    requestId,
    targets,
    results,
    registeredPurgers: PURGERS.length,
  });
  return NextResponse.json({ ok: true, targets, results });
}
