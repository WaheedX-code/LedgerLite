import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function ExpensesPage() {
  const user = await getCurrentUser();
  const where = user.role === "ADMIN" ? {} : { ownerId: user.id };

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Expenses</h1>
        <Link href="/dashboard/expenses/new" className="btn-primary">
          Log expense
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
    </div>
  );
}
