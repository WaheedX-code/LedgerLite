import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  assertOwnerOrAdmin,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/auth";
import { updateInvoiceStatusSchema, isLegalInvoiceStatusTransition } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { items: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    assertOwnerOrAdmin(user, invoice.ownerId);
    return NextResponse.json(invoice);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    // 404 rather than 403 on a resource that isn't theirs — see
    // Project 3 brief: don't let the error itself leak that the ID exists.
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    const invoice = await prisma.invoice.findUnique({ where: { id: params.id } });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    assertOwnerOrAdmin(user, invoice.ownerId);

    const body = await req.json();
    const parsed = updateInvoiceStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    
    // Coding standard (Project 2, Rule 4 / TICKET-04 / SR-1): the schema
    // above only validates that the NEW value is a legal enum member — it
    // says nothing about whether the transition from the CURRENT status is
    // allowed. ADMIN bypasses this check (consistent with
    // assertOwnerOrAdmin's all-access-for-ADMIN pattern); a MEMBER may only
    // move status forward per LEGAL_INVOICE_STATUS_TRANSITIONS.
    if (
      user.role !== "ADMIN" &&
      !isLegalInvoiceStatusTransition(invoice.status, parsed.data.status)
    ) {
      return NextResponse.json(
        { error: `Cannot change status from '${invoice.status}' to '${parsed.data.status}'` },
        { status: 400 }
      );
    }
    
    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data: { status: parsed.data.status },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    const invoice = await prisma.invoice.findUnique({ where: { id: params.id } });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    assertOwnerOrAdmin(user, invoice.ownerId);

    await prisma.invoice.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
