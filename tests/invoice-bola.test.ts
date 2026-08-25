/**
 * Regression suite: cross-tenant invoice access (BOLA).
 *
 * Traces to: Project 1, Threats #1/#2 (confirmed runtime-exploitable
 * pattern class, though these specific routes were already correctly
 * defended — see Project 1, Section 5A, Evidence Items 1-2). Project 2,
 * Deliverable 6 checklist item 3; Deliverable 1, Rule 2 / SR-7.
 *
 * This is the exact test the Project 2 brief names directly: "a test
 * asserting a MEMBER requesting another member's invoice ID gets a 404."
 *
 * Approach: import the real route handler and invoke it directly with a
 * constructed NextRequest, mocking getCurrentUser() (Clerk auth) and the
 * Prisma client at the module level. This exercises the actual handler
 * logic, request parsing, and response shaping — not a live server, but
 * not a trivial unit test either; this is the standard, documented
 * pattern for testing Next.js App Router route handlers without running
 * a full server (next-test-api-route-handler and the community patterns
 * this project's research surfaced all converge on this same approach).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock } from "./__mocks__/prisma";

// Mock lib/auth.ts's session resolution — we control exactly which user
// each test believes is signed in, without needing a real Clerk session.
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getCurrentUser: vi.fn(),
  };
});

// Mock lib/prisma.ts's exported instance to be the shared vitest-mock-extended
// deep mock, rather than the real PrismaClient — see tests/__mocks__/prisma.ts
// for why this replaces a hand-rolled per-file mock.
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getCurrentUser } from "@/lib/auth";
import { GET, PATCH, DELETE } from "@/app/api/invoices/[id]/route";

const OWNER = { id: "user_owner_test", email: "owner@test.local", role: "MEMBER", apiKey: null };
const OTHER_MEMBER = { id: "user_other_test", email: "other@test.local", role: "MEMBER", apiKey: null };
const ADMIN = { id: "user_admin_test", email: "admin@test.local", role: "ADMIN", apiKey: null };

const OWNED_INVOICE = {
  id: "inv_test_regression_1",
  ownerId: OWNER.id,
  clientName: "Regression Test Client",
  amountCents: 5000,
  status: "draft",
  dueDate: new Date("2026-09-01"),
};

function buildParams(id: string) {
  return { params: { id } };
}

describe("GET /api/invoices/[id] — cross-tenant access (BOLA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 (not 403) when a MEMBER requests another member's invoice", async () => {
    // This is the exact scenario the Project 2 brief names directly.
    vi.mocked(getCurrentUser).mockResolvedValue(OTHER_MEMBER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(OWNED_INVOICE as any);

    const req = new NextRequest(
      `https://ledger-lite-nine.vercel.app/api/invoices/${OWNED_INVOICE.id}`
    );
    const res = await GET(req, buildParams(OWNED_INVOICE.id));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
    // Specifically NOT 403 — Project 1's own reasoning (route.ts comment,
    // "don't let the error itself leak that the ID exists") is the thing
    // under test here, not just "access was denied somehow."
    expect(res.status).not.toBe(403);
  });

  it("returns the invoice (200) when the owning MEMBER requests it", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OWNER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(OWNED_INVOICE as any);

    const req = new NextRequest(
      `https://ledger-lite-nine.vercel.app/api/invoices/${OWNED_INVOICE.id}`
    );
    const res = await GET(req, buildParams(OWNED_INVOICE.id));

    expect(res.status).toBe(200);
  });

  it("returns the invoice (200) when an ADMIN requests another member's invoice", async () => {
    // ADMIN is intentionally all-access, per assertOwnerOrAdmin's design —
    // this test exists so a future change can't accidentally lock ADMIN
    // out while trying to fix something else.
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN as any);
    prismaMock.invoice.findUnique.mockResolvedValue(OWNED_INVOICE as any);

    const req = new NextRequest(
      `https://ledger-lite-nine.vercel.app/api/invoices/${OWNED_INVOICE.id}`
    );
    const res = await GET(req, buildParams(OWNED_INVOICE.id));

    expect(res.status).toBe(200);
  });

  it("returns 404 for a genuinely nonexistent invoice ID, identical to the wrong-owner case", async () => {
    // Confirms the two failure modes (wrong owner vs. doesn't exist) are
    // indistinguishable from the outside — the reconnaissance-resistant
    // property Project 1's Narrative 5 specifically tested for.
    vi.mocked(getCurrentUser).mockResolvedValue(OTHER_MEMBER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(null);

    const req = new NextRequest(
      "https://ledger-lite-nine.vercel.app/api/invoices/inv_does_not_exist"
    );
    const res = await GET(req, buildParams("inv_does_not_exist"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });
});

describe("DELETE /api/invoices/[id] — cross-tenant access (BOLA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when a MEMBER attempts to delete another member's invoice", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(OTHER_MEMBER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(OWNED_INVOICE as any);

    const req = new NextRequest(
      `https://ledger-lite-nine.vercel.app/api/invoices/${OWNED_INVOICE.id}`,
      { method: "DELETE" }
    );
    const res = await DELETE(req, buildParams(OWNED_INVOICE.id));

    expect(res.status).toBe(404);
    // The delete must never have been attempted.
    expect(prismaMock.invoice.delete).not.toHaveBeenCalled();
  });
});

