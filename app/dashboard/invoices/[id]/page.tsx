import { notFound } from "next/navigation";
import { getCurrentUser, assertOwnerOrAdmin, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StatusControl from "./status-control";

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { items: true },
  });

  if (!invoice) notFound();

  // The access-control check every request for THIS resource must pass.
  // This is the exact line Project 3's negative test asserts: a MEMBER
  // requesting another member's invoice ID gets a 403, not the data.
  try {
    assertOwnerOrAdmin(user, invoice.ownerId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound(); // 404, not 403 — avoids confirming the ID exists
    throw e;
  }

  const total = invoice.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  );

  return (
    <div className="max-w-xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">{invoice.clientName}</h1>
          <p className="text-sm text-ink/50">
            Due {new Date(invoice.dueDate).toLocaleDateString()}
          </p>
        </div>
        <StatusControl invoiceId={invoice.id} currentStatus={invoice.status} />
      </div>

      <div className="mb-6">
        {invoice.items.map((item) => (
          <div key={item.id} className="ledger-row">
            <span>
              {item.description}{" "}
              <span className="text-ink/40">× {item.quantity}</span>
            </span>
            <span />
            <span className="ledger-amount">
              {formatCents(item.quantity * item.unitPriceCents)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <p className="font-mono text-2xl tabular-nums">{formatCents(total)}</p>
      </div>
    </div>
  );
}
