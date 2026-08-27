import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="font-display text-lg font-semibold">
              LedgerLite
            </Link>
            <nav className="flex gap-6 text-sm text-ink/70">
              <Link href="/dashboard/invoices" className="hover:text-ink">
                Invoices
              </Link>
              <Link href="/dashboard/expenses" className="hover:text-ink">
                Expenses
              </Link>
              <Link href="/dashboard/settings/api-key" className="hover:text-ink">
                API key
              </Link>
              {user.role === "ADMIN" && (
                <span className="font-mono text-xs uppercase tracking-wide text-amber">
                  Admin view
                </span>
              )}
            </nav>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
