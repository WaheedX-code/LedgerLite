/**
 * Regression suite: invoice status transition guard.
 *
 * Traces to: Project 1, Threat #4 / SR-1. Project 2, TICKET-04, Deliverable
 * 1 Rule 4. This directly closes the open item flagged honestly in
 * Deliverable 6's completed checklist for PR #1 (project2/appsec-pipeline):
 * the status-transition fix shipped with no regression test at the time.
 *
 * Confirms the exact behavior SR-1 requires: "A MEMBER-initiated
 * paid -> draft or paid -> sent transition must return 400 with no state
 * change." Also covers the pure transition-table logic directly (the
 * same 8 cases already verified manually during development — now
 * codified as an actual, CI-enforced test rather than a one-off check).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { isLegalInvoiceStatusTransition } from "@/lib/validation";
import { prismaMock } from "./__mocks__/prisma";

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, getCurrentUser: vi.fn() };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getCurrentUser } from "@/lib/auth";
import { PATCH } from "@/app/api/invoices/[id]/route";

const OWNER = { id: "user_owner_test", email: "owner@test.local", role: "MEMBER", apiKey: null };
const ADMIN = { id: "user_admin_test", email: "admin@test.local", role: "ADMIN", apiKey: null };

function paidInvoice() {
  return {
    id: "inv_status_test",
    ownerId: OWNER.id,
    clientName: "Status Test Client",
    amountCents: 1000,
    status: "paid",
    dueDate: new Date("2026-09-01"),
  };
}

function patchRequest(status: string) {
  return new NextRequest("https://ledger-lite-nine.vercel.app/api/invoices/inv_status_test", {
    method: "PATCH",
    body: JSON.stringify({ status }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("isLegalInvoiceStatusTransition — pure transition-table logic", () => {
  it.each([
    ["draft", "sent", true],
    ["sent", "paid", true],
    ["paid", "draft", false],
    ["paid", "sent", false],
    ["draft", "paid", false],
    ["sent", "draft", false],
    ["draft", "draft", false],
    ["paid", "paid", false],
  ])("%s -> %s should be legal: %s", (from, to, expected) => {
    expect(isLegalInvoiceStatusTransition(from, to)).toBe(expected);
  });
});

describe("PATCH /api/invoices/[id] — status transition guard (SR-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a MEMBER-initiated paid -> draft transition with 400 and does not write", async () => {
    // This is the exact scenario SR-1 states as its pass/fail test.
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(paidInvoice() as any);

    const res = await PATCH(patchRequest("draft"), { params: { id: "inv_status_test" } });

    expect(res.status).toBe(400);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it("rejects a MEMBER-initiated paid -> sent transition with 400 and does not write", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(paidInvoice() as any);

    const res = await PATCH(patchRequest("sent"), { params: { id: "inv_status_test" } });

    expect(res.status).toBe(400);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to move an invoice from paid back to draft", async () => {
    // ADMIN bypasses the transition table by design — this test guards
    // against a future fix accidentally locking ADMIN out too.
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.invoice.findUnique.mockResolvedValue(paidInvoice() as any);
    prismaMock.invoice.update.mockResolvedValue({
      ...paidInvoice(),
      status: "draft",
    } as any);

    const res = await PATCH(patchRequest("draft"), { params: { id: "inv_status_test" } });

    expect(res.status).toBe(200);
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv_status_test" },
      data: { status: "draft" },
    });
  });
});
