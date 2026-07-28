/**
 * Rendered by the catch-all route when the active CMS adapter has no
 * credentials — a fresh checkout of the boilerplate boots to instructions
 * instead of a stack trace. Delete-safe once a project is wired up.
 */
export function CmsSetupNotice({ provider }: { provider: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16 font-mono text-sm">
      <h1 className="text-xl font-bold">CMS not configured</h1>
      <p>
        The active CMS provider is <strong>{provider}</strong>, but its required environment
        variables are missing.
      </p>
      <ol className="list-decimal space-y-1 pl-6">
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code>
        </li>
        <li>Fill in the provider credentials</li>
        <li>Restart the dev server</li>
      </ol>
      <p>
        Full setup guide: <code>docs/playbooks/contentstack.md</code> · Architecture:{" "}
        <code>AGENTS.md</code>
      </p>
    </main>
  );
}
