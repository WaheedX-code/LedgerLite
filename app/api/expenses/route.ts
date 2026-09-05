import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, UnauthenticatedError } from "@/lib/auth";
import { createExpenseSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { logAdminCrossTenantListAccess } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const where = user.role === "ADMIN" ? {} : { ownerId: user.id };
    const expenses = await prisma.expense.findMany({ where });

    // TICKET-01 / SR-2 (b) - same pattern as GET /api/invoices: one entry
    // per qualifying request, not one per row.
    if (user.role === "ADMIN" && expenses.some((exp) => exp.ownerId !== user.id)) {
      await logAdminCrossTenantListAccess({ actorId: user.id, resourceType: "Expense" });
    }

    return NextResponse.json(expenses);
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
    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid expense data" }, { status: 400 });
    }
    const { description, amountCents, category, incurredAt } = parsed.data;
    
    // ownerId is ALWAYS derived from the authenticated session, never from the 
    // request body - this is the mass assignment guard for this route.
    const expense = await prisma.expense.create({
      data: {
        ownerId: user.id,
        description,
        amountCents,
        category,
        incurredAt: new Date(incurredAt),
      },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}
