import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, UnauthenticatedError } from "@/lib/auth";
import { createExpenseSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const where = user.role === "ADMIN" ? {} : { ownerId: user.id };
    const expenses = await prisma.expense.findMany({ where });
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

    const expense = await prisma.expense.create({
      data: { ...body, incurredAt: new Date(body.incurredAt), ownerId: user.id },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}
