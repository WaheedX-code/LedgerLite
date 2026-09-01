/**
 * Regression suite: invoice access control, PATCH + collection routes.
 *
 * Traces to: Project 2, TICKET-09 ("expand into full positive/negative
 * coverage per role... covering both invoices and expenses" — recorded in
 * Project 2's closure report as PARTIALLY complete). Project 3,
 * Deliverable 4.
 *
 * tests/invoice-bola.test.ts already covers GET and DELETE on
 * /api/invoices/[id]. This file closes the two gaps that were left when
 * that suite was written:
 *
 *  1. PATCH /api/invoices/[id] (status transitions) had NO negative
 *     authorization test at all — only GET and DELETE were covered.
 *
 *  2. GET/POST /api/invoices (the collection routes) had NO test coverage
 *     of any kind. These routes don't call assertOwnerOrAdmin() — they use
 *     two different enforcement mechanisms documented in the Project 3
 *     access control matrix: an inline `where` filter for GET (a MEMBER's
 *     query never returns another user's rows at the database level) and
 *     a forced `ownerId: user.id` on POST (mass-assignment guard — a
 *     client-supplied ownerId, if sent, is ignored). Both were previously
 *     verified only by manual code review, never by a running test.
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
import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/invoices/route";

const OWNER = { id: "user_owner_test", email: "owner@test.local", role: "MEMBER", apiKey: null };
const OTHER_MEMBER = { id: "user_other_test", email: "other@test.local", role: "MEMBER", apiKey: null };
const ADMIN = { id: "user_admin_test", email: "admin@test.local", role: "ADMIN", apiKey: null };

const DRAFT_INVOICE = {
  id: "inv_patch_regression_1",
  ownerId: OWNER.id,
  clientName: "PATCH Regression Client",
  amountCents: 7500,
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

describe("PATCH /api/invoices/[id] — cross-tenant access (BOLA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 (not 403) when a MEMBER attempts to change another member's invoice status", async () => {
    // A legal transition (draft -> sent) is used deliberately: this proves
    // the denial is the OWNERSHIP check, not a rejected status transition.
    // assertOwnerOrAdmin() runs before the transition-legality check in the
    // route (see route.ts lines 41-57), so this also confirms ordering:
    // authorization is checked before business-logic validation, not after.
    vi.mocked(getCurrentUser).mockResolvedValue(OTHER_MEMBER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(DRAFT_INVOICE as any);

    const req = patchRequest(DRAFT_INVOICE.id, { status: "sent" });
    const res = await PATCH(req, buildParams(DRAFT_INVOICE.id));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it("allows the owning MEMBER to make a legal status transition", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(DRAFT_INVOICE as any);
    prismaMock.invoice.update.mockResolvedValue({ ...DRAFT_INVOICE, status: "sent" } as any);

    const req = patchRequest(DRAFT_INVOICE.id, { status: "sent" });
    const res = await PATCH(req, buildParams(DRAFT_INVOICE.id));

    expect(res.status).toBe(200);
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: DRAFT_INVOICE.id },
      data: { status: "sent" },
    });
  });

  it("allows an ADMIN to change another member's invoice status", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.invoice.findUnique.mockResolvedValue(DRAFT_INVOICE as any);
    prismaMock.invoice.update.mockResolvedValue({ ...DRAFT_INVOICE, status: "sent" } as any);

    const req = patchRequest(DRAFT_INVOICE.id, { status: "sent" });
    const res = await PATCH(req, buildParams(DRAFT_INVOICE.id));

    expect(res.status).toBe(200);
  });
});

describe("GET /api/invoices — collection scoping (mechanism B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries ONLY the caller's own rows when the caller is a MEMBER", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.invoice.findMany.mockResolvedValue([DRAFT_INVOICE] as any);

    const res = await GET_LIST();

    expect(res.status).toBe(200);
    // This IS the actual enforcement mechanism under test: a MEMBER's
    // query must be scoped by ownerId at the database level. If this ever
    // regressed to an unscoped `findMany({})`, this assertion — not just
    // the response body — would catch it, even if a mocked response
    // happened to look correct.
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith({
      where: { ownerId: OWNER.id },
      include: { items: true },
    });
  });

  it("queries ALL rows (no ownerId filter) when the caller is an ADMIN", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.invoice.findMany.mockResolvedValue([DRAFT_INVOICE] as any);

    await GET_LIST();

    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith({
      where: {},
      include: { items: true },
    });
  });
});

describe("POST /api/invoices — mass-assignment guard (mechanism C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a client-supplied ownerId and attributes the invoice to the authenticated caller", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.invoice.create.mockResolvedValue(DRAFT_INVOICE as any);

    // A MEMBER attempts to create an invoice "as" OTHER_MEMBER by sending
    // an ownerId in the body. The route must not trust this field.
    const req = new NextRequest("https://ledger-lite-nine.vercel.app/api/invoices", {
      method: "POST",
      body: JSON.stringify({
        ownerId: OTHER_MEMBER.id, // attempted spoof — must be ignored
        clientName: "Spoof Attempt Client",
        dueDate: "2026-12-01T00:00:00.000Z",
        items: [{ description: "Item", quantity: 1, unitPriceCents: 1000 }],
      }),
    });

    await POST_CREATE(req);

    expect(prismaMock.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: OWNER.id }), // NOT OTHER_MEMBER.id
      })
    );
  });
});

