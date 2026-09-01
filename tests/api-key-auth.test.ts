/**
 * Regression suite: public API key authentication (hash-and-compare fix).
 *
 * Traces to: Project 1, Threat #8 (plaintext API key) and Threat #17
 * (no issuance path existed at all). Project 3, TICKET-02 / TICKET-07,
 * Deliverable 6 (API credential hardening).
 *
 * Background — the bug this suite exists to prevent from recurring:
 * app/api/account/api-key/route.ts generates a raw key and stores
 * sha256(rawKey) in User.apiKey. Prior to this fix, lib/auth.ts's
 * getUserByApiKey() queried `where: { apiKey: <raw incoming key> }` —
 * comparing a raw value against a stored hash, which can never match.
 * This was reproduced against the live deployment: a freshly generated
 * key returned 401 "Invalid or missing API key" from
 * GET /api/v1/invoices/:id, confirmed via curl, with the stored hash
 * independently verified to equal sha256(rawKey) via `shasum -a 256`
 * before the fix was written (see Project 3 walkthrough, Stage 1).
 *
 * These tests exercise the real GET handler for the public v1 route and
 * the real hashApiKey()/getUserByApiKey() functions from lib/auth.ts —
 * only the Prisma client is mocked. This is deliberate: a test that
 * mocked getUserByApiKey() itself would not have caught the original
 * bug, since the bug WAS getUserByApiKey()'s internal comparison logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock } from "./__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { hashApiKey } from "@/lib/auth";
import { GET } from "@/app/api/v1/invoices/[id]/route";

const RAW_KEY = "llk_live_test_regression_raw_key_do_not_reuse";
const HASHED_KEY = hashApiKey(RAW_KEY);

const OWNER = {
  id: "user_apikey_owner_test",
  email: "apikey-owner@test.local",
  role: "MEMBER",
  apiKey: HASHED_KEY,
};

const OTHER_MEMBER = {
  id: "user_apikey_other_test",
  email: "apikey-other@test.local",
  role: "MEMBER",
  apiKey: "sha256_hash_of_a_different_key_entirely",
};

const OWNED_INVOICE = {
  id: "inv_apikey_regression_1",
  ownerId: OWNER.id,
  clientName: "API Key Regression Client",
  amountCents: 12000,
  status: "sent",
  dueDate: new Date("2026-10-01"),
};

function buildParams(id: string) {
  return { params: { id } };
}

function requestWithKey(invoiceId: string, key: string | null) {
  const headers = new Headers();
  if (key !== null) headers.set("x-api-key", key);
  return new NextRequest(
    `https://ledger-lite-nine.vercel.app/api/v1/invoices/${invoiceId}`,
    { headers }
  );
}

describe("hashApiKey()", () => {
  it("is deterministic — the same raw key always hashes the same way", () => {
    // This is the property the original bug violated implicitly: the
    // generation route and the lookup function must derive the identical
    // hash from the identical raw key, or no key can ever authenticate.
    expect(hashApiKey(RAW_KEY)).toBe(HASHED_KEY);
    expect(hashApiKey(RAW_KEY)).toBe(hashApiKey(RAW_KEY));
  });

  it("produces a 64-character hex string (SHA-256), not the raw input", () => {
    expect(HASHED_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(HASHED_KEY).not.toBe(RAW_KEY);
  });
});

describe("GET /api/v1/invoices/[id] — API key authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("REGRESSION: a freshly generated key authenticates successfully (this is the exact case that returned 401 before the fix)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(OWNER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(OWNED_INVOICE as any);

    const req = requestWithKey(OWNED_INVOICE.id, RAW_KEY);
    const res = await GET(req, buildParams(OWNED_INVOICE.id));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(OWNED_INVOICE.id);

    // Confirms getUserByApiKey() queried using the HASH of the raw key,
    // not the raw key itself — this is the actual mechanism of the fix,
    // not just its observable side effect.
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { apiKey: HASHED_KEY },
    });
  });

  it("rejects the raw key's own hash presented as if it were the key (confirms comparison is hash-of-input, not stored-value-as-input)", async () => {
    // If getUserByApiKey() ever regressed to comparing raw values without
    // hashing the input first, sending the HASH directly would succeed
    // where it should not. Sending the hash as the "key" must still fail,
    // because the correct behavior hashes whatever is presented.
    prismaMock.user.findUnique.mockResolvedValue(null);

    const req = requestWithKey(OWNED_INVOICE.id, HASHED_KEY);
    const res = await GET(req, buildParams(OWNED_INVOICE.id));

    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { apiKey: hashApiKey(HASHED_KEY) },
    });
  });

  it("returns 401 with no invoice lookup attempted when the x-api-key header is missing", async () => {
    const req = requestWithKey(OWNED_INVOICE.id, null);
    const res = await GET(req, buildParams(OWNED_INVOICE.id));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Invalid or missing API key" });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.invoice.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 for a well-formed but wrong key, without leaking whether the invoice exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const req = requestWithKey(OWNED_INVOICE.id, "llk_live_totally_wrong_key");
    const res = await GET(req, buildParams(OWNED_INVOICE.id));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Invalid or missing API key" });
    // Authentication must fail closed BEFORE any resource lookup — this
    // is what distinguishes the 401 (auth failure) from the BOLA route's
    // 404 (authenticated, but wrong owner or nonexistent resource).
    expect(prismaMock.invoice.findUnique).not.toHaveBeenCalled();
  });

  it("BOLA: a valid key for OTHER_MEMBER cannot fetch OWNER's invoice, even though authentication succeeds", async () => {
    prismaMock.user.findUnique.mockResolvedValue(OTHER_MEMBER as any);
    prismaMock.invoice.findUnique.mockResolvedValue(OWNED_INVOICE as any);

    const req = requestWithKey(OWNED_INVOICE.id, "raw_key_for_other_member");
    const res = await GET(req, buildParams(OWNED_INVOICE.id));
    const body = await res.json();

    // 404, not 403 — consistent with the session-based routes' BOLA
    // behavior in tests/invoice-bola.test.ts: don't confirm the ID exists.
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });
});
