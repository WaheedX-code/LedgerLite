import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, UnauthenticatedError } from "@/lib/auth";
import { createInvoiceSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const where = user.role === "ADMIN" ? {} : { ownerId: user.id };
    const invoices = await prisma.invoice.findMany({ where, include: { items: true } });
    return NextResponse.json(invoices);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    const body = await req.json();
    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      // Never echo raw Zod internals to the client — return a flat message,
      // keep the field-level detail server-side in logs only.
      return NextResponse.json({ error: "Invalid invoice data" }, { status: 400 });
    }
    const { clientName, dueDate, items } = parsed.data;

    const amountCents = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0
    );

    // ownerId is ALWAYS derived from the authenticated session, never from
    // the request body — this is the mass-assignment guard for this route.
    const invoice = await prisma.invoice.create({
      data: {
        ownerId: user.id,
        clientName,
        dueDate: new Date(dueDate),
        amountCents,
        items: { create: items },
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}
