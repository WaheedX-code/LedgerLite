/**
 * TICKET-01 / SR-2 (Project 1, Critical; Project 3, Deliverable 10).
 *
 * These tests confirm the audit log is written on exactly the two
 * SR-2-specified conditions, and — just as importantly — is NOT written
 * on adjacent cases that could be mistaken for triggering it (a MEMBER
 * changing their own status; an ADMIN reading/writing their OWN
 * resource). An audit log that over-fires is nearly as untrustworthy as
 * one that under-fires, since it buries the genuinely cross-tenant
 * events the log exists to surface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock } from "./__mocks__/prisma";

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, getCurrentUser: vi.fn() };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getCurrentUser } from "@/lib/auth";
import { PATCH } from "@/app/api/invoices/[id]/route";
import { GET as GET_INVOICES } from "@/app/api/invoices/route";
import { DELETE as DELETE_EXPENSE } from "@/app/api/expenses/[id]/route";

const OWNER = { id: "user_owner_test", email: "owner@test.local", role: "MEMBER", apiKey: null };
const ADMIN = { id: "user_admin_test", email: "admin@test.local", role: "ADMIN", apiKey: null };

const DRAFT_INVOICE = {
  id: "inv_audit_test_1",
  ownerId: OWNER.id,
  clientName: "Audit Test Client",
  amountCents: 5000,
  status: "draft",
  dueDate: new Date("2026-11-01"),
};

function buildParams(id: string) {
  return { params: { id } };
}

function patchRequest(id: string, body: unknown) {
  return new NextRequest(`https://ledger-lite-nine.vercel.app/api/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("AuditLog — STATUS_CHANGE (SR-2 condition a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a status change made by the owning MEMBER", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(DRAFT_INVOICE as any);
    prismaMock.invoice.update.mockResolvedValue({ ...DRAFT_INVOICE, status: "sent" } as any);

    await PATCH(patchRequest(DRAFT_INVOICE.id, { status: "sent" }), buildParams(DRAFT_INVOICE.id));

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: OWNER.id,
        action: "STATUS_CHANGE",
        resourceType: "Invoice",
        resourceId: DRAFT_INVOICE.id,
        resourceOwnerId: OWNER.id,
        metadata: { from: "draft", to: "sent" },
      },
    });
  });

  it("does NOT log a status change when the request is rejected for an illegal transition", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    // paid -> draft is not a legal transition per LEGAL_INVOICE_STATUS_TRANSITIONS
    prismaMock.invoice.findUnique.mockResolvedValue({ ...DRAFT_INVOICE, status: "paid" } as any);

    const res = await PATCH(
      patchRequest(DRAFT_INVOICE.id, { status: "draft" }),
      buildParams(DRAFT_INVOICE.id)
    );

    expect(res.status).toBe(400);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("AuditLog — ADMIN_CROSS_TENANT_ACCESS (SR-2 condition b), item-level", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs when an ADMIN modifies a resource they do not own", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.invoice.findUnique.mockResolvedValue(DRAFT_INVOICE as any);
    prismaMock.invoice.update.mockResolvedValue({ ...DRAFT_INVOICE, status: "sent" } as any);

    await PATCH(patchRequest(DRAFT_INVOICE.id, { status: "sent" }), buildParams(DRAFT_INVOICE.id));

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: ADMIN.id,
          action: "ADMIN_CROSS_TENANT_ACCESS",
          resourceType: "Invoice",
          resourceId: DRAFT_INVOICE.id,
          resourceOwnerId: OWNER.id,
        }),
      })
    );
    // Both conditions fire independently on this one request: the admin
    // cross-tenant access AND the status change itself. Two separate
    // audit rows, not one merged entry.
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("does NOT log ADMIN_CROSS_TENANT_ACCESS when an ADMIN modifies their OWN resource", async () => {
    const adminOwnedInvoice = { ...DRAFT_INVOICE, ownerId: ADMIN.id };
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.invoice.findUnique.mockResolvedValue(adminOwnedInvoice as any);
    prismaMock.invoice.update.mockResolvedValue({ ...adminOwnedInvoice, status: "sent" } as any);

    await PATCH(
      patchRequest(adminOwnedInvoice.id, { status: "sent" }),
      buildParams(adminOwnedInvoice.id)
    );

    // Only the STATUS_CHANGE entry should exist — no cross-tenant entry,
    // since the admin owns this invoice themself.
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "STATUS_CHANGE" }) })
    );
  });

  it("logs when an ADMIN deletes an expense they do not own", async () => {
    const ownedExpense = {
      id: "exp_audit_test_1",
      ownerId: OWNER.id,
      description: "Audit Test Expense",
      amountCents: 1000,
      category: "Software",
      incurredAt: new Date(),
      createdAt: new Date(),
    };
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.expense.findUnique.mockResolvedValue(ownedExpense as any);

    const req = new NextRequest(
      `https://ledger-lite-nine.vercel.app/api/expenses/${ownedExpense.id}`,
      { method: "DELETE" }
    );
    await DELETE_EXPENSE(req, buildParams(ownedExpense.id));

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: ADMIN.id,
        action: "ADMIN_CROSS_TENANT_ACCESS",
        resourceType: "Expense",
        resourceId: ownedExpense.id,
        resourceOwnerId: OWNER.id,
      },
    });
  });
});

describe("AuditLog — ADMIN_CROSS_TENANT_ACCESS, collection-level (one entry per request, not per row)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs ONE entry when an ADMIN lists invoices including at least one foreign-owned row", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.invoice.findMany.mockResolvedValue([
      DRAFT_INVOICE, // owned by OWNER, not ADMIN
      { ...DRAFT_INVOICE, id: "inv_audit_test_2", ownerId: "user_yet_another" },
    ] as any);

    await GET_INVOICES();

    // Two foreign-owned rows returned, but exactly ONE log entry — this
    // is the deliberate per-request (not per-row) design.
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: ADMIN.id,
        action: "ADMIN_CROSS_TENANT_ACCESS",
        resourceType: "Invoice",
        resourceId: null,
        resourceOwnerId: null,
      },
    });
  });

  it("does NOT log when an ADMIN's invoice list contains only their own rows", async () => {
    const adminOwnedInvoice = { ...DRAFT_INVOICE, ownerId: ADMIN.id };
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.invoice.findMany.mockResolvedValue([adminOwnedInvoice] as any);

    await GET_INVOICES();

    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("does NOT log for a MEMBER's own invoice list, regardless of contents", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.invoice.findMany.mockResolvedValue([DRAFT_INVOICE] as any);

    await GET_INVOICES();

    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});
