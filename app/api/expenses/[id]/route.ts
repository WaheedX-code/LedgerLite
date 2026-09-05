import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  assertOwnerOrAdmin,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminCrossTenantAccess } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    const expense = await prisma.expense.findUnique({ where: { id: params.id } });
    if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

    assertOwnerOrAdmin(user, expense.ownerId);

    // TICKET-01 / SR-2 (b): ADMIN deleting a resource they don't own.
    if (user.role === "ADMIN" && expense.ownerId !== user.id) {
      await logAdminCrossTenantAccess({
        actorId: user.id,
        resourceType: "Expense",
        resourceId: expense.id,
        resourceOwnerId: expense.ownerId,
      });
    }

    await prisma.expense.delete({ where: { id: params.id } });
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
