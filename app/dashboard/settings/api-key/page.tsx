"use client";

import { useState, useEffect } from "react";

/**
 * TICKET-11 (Project 2 UI half). Closes Threat #17 ("no dashboard UI...
 * exists anywhere in the codebase" — Project 1, confirmed via runtime
 * evidence). See app/api/account/api-key/route.ts for the explicit
 * scope boundary between what this project built (hashed storage, a
 * real generate/revoke UI) and what remains Project 3's job
 * (TICKET-02: updating the lookup to hash-and-compare; TICKET-07: scope
 * metadata). The known-incomplete state is surfaced to the user
 * directly below, not hidden.
 */
export default function ApiKeySettingsPage() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/api-key")
      .then((res) => res.json())
      .then((data) => setHasKey(Boolean(data.hasApiKey)))
      .catch(() => setError("Could not load API key status."));
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/api-key", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate key");
      const data = await res.json();
      setGeneratedKey(data.apiKey);
      setHasKey(true);
    } catch {
      setError("Something went wrong generating your key. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/api-key", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke key");
      setHasKey(false);
      setGeneratedKey(null);
    } catch {
      setError("Something went wrong revoking your key. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold mb-2">
        Integration API key
      </h1>
      <p className="text-sm text-ink/70 mb-6">
        Use this key to connect an external accounting tool to your
        LedgerLite invoices via the public API.
      </p>

      <div className="rounded border border-amber/40 bg-amber/5 p-4 mb-6 text-sm">
        <strong className="block mb-1">Known limitation, stated plainly:</strong>
        This key is stored securely (hashed, not in plaintext) as of this
        change. However, until a related backend fix ships, a newly
        generated key will not yet successfully authenticate against the
        public API endpoint — the verification step on that side still
        expects the old storage format. Full end-to-end functionality is
        tracked separately; this page and the storage fix are complete on
        their own.
      </div>

      {error && (
        <div className="rounded border border-red-400/40 bg-red-50 p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {generatedKey && (
        <div className="rounded border border-rule bg-paper p-4 mb-6">
          <p className="text-sm font-medium mb-2">
            Your new key (shown once — copy it now, it cannot be viewed
            again):
          </p>
          <code className="block break-all rounded bg-ink/5 p-3 font-mono text-xs">
            {generatedKey}
          </code>
        </div>
      )}

      {hasKey === null && (
        <p className="text-sm text-ink/50">Checking your key status…</p>
      )}

      {hasKey === true && !generatedKey && (
        <div>
          <p className="text-sm text-ink/70 mb-4">
            You have an active API key. Generating a new one will
            immediately invalidate the current one.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Generating…" : "Regenerate key"}
            </button>
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="rounded border border-rule px-4 py-2 text-sm hover:bg-ink/5"
            >
              {loading ? "Revoking…" : "Revoke key"}
            </button>
          </div>
        </div>
      )}

      {hasKey === false && (
        <button onClick={handleGenerate} disabled={loading} className="btn-primary">
          {loading ? "Generating…" : "Generate API key"}
        </button>
      )}
    </div>
  );
}

