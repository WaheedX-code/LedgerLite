import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function DashboardHome() {
  const user = await getCurrentUser();

  // Ownership filter applied here even though this is a read-only summary —
  // consistency matters more than "it's just a dashboard". An ADMIN sees all.
  const where = user.role === "ADMIN" ? {} : { ownerId: user.id };

  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.expense.findMany({ where, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const outstandingCents = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + i.amountCents, 0);

  return (
    <div className="space-y-12">
      <section>
        <p className="field-label">Outstanding</p>
        <p className="font-mono text-4xl tabular-nums">
          {formatCents(outstandingCents)}
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Recent invoices</h2>
          <Link href="/dashboard/invoices" className="text-sm text-forest">
            View all
          </Link>
        </div>
        <div>
          {invoices.map((inv) => (
            <div key={inv.id} className="ledger-row">
              <span>{inv.clientName}</span>
              <span className="font-mono text-xs uppercase text-ink/50">
                {inv.status}
              </span>
              <span className="ledger-amount">{formatCents(inv.amountCents)}</span>
            </div>
          ))}
          {invoices.length === 0 && (
            <p className="py-6 text-sm text-ink/50">
              No invoices yet.{" "}
              <Link href="/dashboard/invoices/new" className="text-forest">
                Create one
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Recent expenses</h2>
          <Link href="/dashboard/expenses" className="text-sm text-forest">
            View all
          </Link>
        </div>
        <div>
          {expenses.map((exp) => (
            <div key={exp.id} className="ledger-row">
              <span>{exp.description}</span>
              <span className="font-mono text-xs uppercase text-ink/50">
                {exp.category}
              </span>
              <span className="ledger-amount">{formatCents(exp.amountCents)}</span>
            </div>
          ))}
          {expenses.length === 0 && (
            <p className="py-6 text-sm text-ink/50">No expenses logged yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
