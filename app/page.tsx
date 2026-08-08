import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <p className="mb-4 font-mono text-xs uppercase tracking-widest text-ink/50">
        LedgerLite
      </p>
      <h1 className="mb-6 font-display text-5xl font-semibold leading-tight">
        Invoicing and expenses, kept plainly.
      </h1>
      <p className="mb-10 max-w-md text-ink/70">
        One ledger for what you're owed and what you spent. No spreadsheet,
        no accounting jargon.
      </p>
      <div className="flex gap-4">
        <Link href="/sign-up" className="btn-primary">
          Open your ledger
        </Link>
        <Link href="/sign-in" className="btn-secondary">
          Sign in
        </Link>
      </div>
    </main>
  );
}
