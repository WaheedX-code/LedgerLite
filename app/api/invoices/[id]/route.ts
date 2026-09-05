import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  assertOwnerOrAdmin,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/auth";
import { updateInvoiceStatusSchema, isLegalInvoiceStatusTransition } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { logStatusChange, logAdminCrossTenantAccess } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { items: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    assertOwnerOrAdmin(user, invoice.ownerId);

    // TICKET-01 / SR-2 (b): ADMIN reading a resource they don't own.
    if (user.role === "ADMIN" && invoice.ownerId !== user.id) {
      await logAdminCrossTenantAccess({
        actorId: user.id,
        resourceType: "Invoice",
        resourceId: invoice.id,
        resourceOwnerId: invoice.ownerId,
      });
    }

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

    // TICKET-01 / SR-2 (b): ADMIN modifying a resource they don't own.
    // Logged here, at the ownership check, regardless of whether the
    // status-transition validation below ultimately succeeds or fails —
    // the admin's access to this specific resource is the event being
    // recorded, not the outcome of the write.
    if (user.role === "ADMIN" && invoice.ownerId !== user.id) {
      await logAdminCrossTenantAccess({
        actorId: user.id,
        resourceType: "Invoice",
        resourceId: invoice.id,
        resourceOwnerId: invoice.ownerId,
      });
    }

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

    // TICKET-01 / SR-2 (a): any Invoice.status change, MEMBER or ADMIN,
    // logged only after the write actually succeeds — a rejected or
    // failed update must never produce a log entry claiming it happened.
    await logStatusChange({
      actorId: user.id,
      invoiceId: invoice.id,
      invoiceOwnerId: invoice.ownerId,
      fromStatus: invoice.status,
      toStatus: parsed.data.status,
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

    // TICKET-01 / SR-2 (b): ADMIN deleting a resource they don't own.
    // Logged before the delete call: if the delete itself throws, we
    // still want a record that the admin attempted access to this
    // specific foreign-owned resource.
    if (user.role === "ADMIN" && invoice.ownerId !== user.id) {
      await logAdminCrossTenantAccess({
        actorId: user.id,
        resourceType: "Invoice",
        resourceId: invoice.id,
        resourceOwnerId: invoice.ownerId,
      });
    }

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
