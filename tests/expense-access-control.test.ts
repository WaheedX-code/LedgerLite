/**
 * Regression suite: expense access control — GET (list), POST (create),
 * DELETE (item). Full coverage built from zero: prior to this file,
 * NO test of any kind existed for any expense route (confirmed via
 * `grep -rl "expense" tests/` returning no matches before this file was
 * added).
 *
 * Traces to: Project 2, TICKET-09 ("expand into full positive/negative
 * coverage per role... covering both invoices and expenses" — the
 * "expenses" half was never started). Project 3, Deliverable 4.
 *
 * Structure deliberately mirrors tests/invoice-bola.test.ts and
 * tests/invoice-access-control-extended.test.ts: the same three
 * enforcement mechanisms from the Project 3 access control matrix apply
 * here too — assertOwnerOrAdmin() for the item-level DELETE route, an
 * inline ownerId `where` filter for the collection GET, and a forced
 * ownerId on POST. Expenses have no GET-by-id or PATCH route at all (an
 * absent endpoint, not a gap — see the access control matrix, footnote 3)
 * so there is nothing to test for those two actions.
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
import { DELETE } from "@/app/api/expenses/[id]/route";
import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/expenses/route";

const OWNER = { id: "user_owner_test", email: "owner@test.local", role: "MEMBER", apiKey: null };
const OTHER_MEMBER = { id: "user_other_test", email: "other@test.local", role: "MEMBER", apiKey: null };
const ADMIN = { id: "user_admin_test", email: "admin@test.local", role: "ADMIN", apiKey: null };

const OWNED_EXPENSE = {
  id: "exp_test_regression_1",
  ownerId: OWNER.id,
  description: "Regression Test Expense",
  amountCents: 4200,
  category: "Software",
  incurredAt: new Date("2026-09-15"),
  createdAt: new Date("2026-09-15"),
};

function buildParams(id: string) {
  return { params: { id } };
}

describe("DELETE /api/expenses/[id] — cross-tenant access (BOLA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 (not 403) when a MEMBER attempts to delete another member's expense", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OTHER_MEMBER as any);
    prismaMock.expense.findUnique.mockResolvedValue(OWNED_EXPENSE as any);

    const req = new NextRequest(
      `https://ledger-lite-nine.vercel.app/api/expenses/${OWNED_EXPENSE.id}`,
      { method: "DELETE" }
    );
    const res = await DELETE(req, buildParams(OWNED_EXPENSE.id));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
    // Confirms the same reconnaissance-resistant pattern used everywhere
    // else in the codebase applies here too: not 403.
    expect(res.status).not.toBe(403);
    expect(prismaMock.expense.delete).not.toHaveBeenCalled();
  });

  it("allows the owning MEMBER to delete their own expense", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.expense.findUnique.mockResolvedValue(OWNED_EXPENSE as any);

    const req = new NextRequest(
      `https://ledger-lite-nine.vercel.app/api/expenses/${OWNED_EXPENSE.id}`,
      { method: "DELETE" }
    );
    const res = await DELETE(req, buildParams(OWNED_EXPENSE.id));

    expect(res.status).toBe(204);
    expect(prismaMock.expense.delete).toHaveBeenCalledWith({ where: { id: OWNED_EXPENSE.id } });
  });

  it("allows an ADMIN to delete another member's expense", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.expense.findUnique.mockResolvedValue(OWNED_EXPENSE as any);

    const req = new NextRequest(
      `https://ledger-lite-nine.vercel.app/api/expenses/${OWNED_EXPENSE.id}`,
      { method: "DELETE" }
    );
    const res = await DELETE(req, buildParams(OWNED_EXPENSE.id));

    expect(res.status).toBe(204);
  });

  it("returns 404 for a genuinely nonexistent expense ID, identical to the wrong-owner case", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OTHER_MEMBER as any);
    prismaMock.expense.findUnique.mockResolvedValue(null);

    const req = new NextRequest(
      "https://ledger-lite-nine.vercel.app/api/expenses/exp_does_not_exist",
      { method: "DELETE" }
    );
    const res = await DELETE(req, buildParams("exp_does_not_exist"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });
});

describe("GET /api/expenses — collection scoping (mechanism B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries ONLY the caller's own rows when the caller is a MEMBER", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.expense.findMany.mockResolvedValue([OWNED_EXPENSE] as any);

    const res = await GET_LIST();

    expect(res.status).toBe(200);
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { ownerId: OWNER.id },
    });
  });

  it("queries ALL rows (no ownerId filter) when the caller is an ADMIN", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.expense.findMany.mockResolvedValue([OWNED_EXPENSE] as any);

    await GET_LIST();

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({ where: {} });
  });
});

describe("POST /api/expenses — mass-assignment guard (mechanism C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a client-supplied ownerId and attributes the expense to the authenticated caller", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.expense.create.mockResolvedValue(OWNED_EXPENSE as any);

    const req = new NextRequest("https://ledger-lite-nine.vercel.app/api/expenses", {
      method: "POST",
      body: JSON.stringify({
        ownerId: OTHER_MEMBER.id, // attempted spoof — must be ignored
        description: "Spoof Attempt Expense",
        amountCents: 999,
        category: "Travel",
        incurredAt: "2026-09-20T00:00:00.000Z",
      }),
    });

    await POST_CREATE(req);

    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: OWNER.id }), // NOT OTHER_MEMBER.id
      })
    );
  });

  it("rejects a malformed payload with 400 before any database write", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);

    const req = new NextRequest("https://ledger-lite-nine.vercel.app/api/expenses", {
      method: "POST",
      body: JSON.stringify({ description: "" }), // missing required fields
    });

    const res = await POST_CREATE(req);

    expect(res.status).toBe(400);
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });
});

