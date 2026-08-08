import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

const statusColor: Record<string, string> = {
  draft: "text-ink/50",
  sent: "text-amber",
  paid: "text-forest",
};

export default async function InvoicesPage() {
  const user = await getCurrentUser();
  const where = user.role === "ADMIN" ? {} : { ownerId: user.id };

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { owner: user.role === "ADMIN" },
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Invoices</h1>
        <Link href="/dashboard/invoices/new" className="btn-primary">
          New invoice
        </Link>
      </div>
      <div>
        {invoices.map((inv) => (
          <Link key={inv.id} href={`/dashboard/invoices/${inv.id}`} className="block">
            <div className="ledger-row hover:bg-rule/10">
              <span>
                {inv.clientName}
                {user.role === "ADMIN" && "owner" in inv && (
                  <span className="ml-2 font-mono text-xs text-ink/40">
                    ({(inv as any).owner?.email})
                  </span>
                )}
              </span>
              <span className={`font-mono text-xs uppercase ${statusColor[inv.status]}`}>
                {inv.status}
              </span>
              <span className="ledger-amount">{formatCents(inv.amountCents)}</span>
            </div>
          </Link>
        ))}
        {invoices.length === 0 && (
          <p className="py-6 text-sm text-ink/50">No invoices yet.</p>
        )}
      </div>
    </div>
  );
}
