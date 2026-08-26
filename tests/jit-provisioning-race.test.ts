/**
 * Regression suite: JIT user provisioning race condition.
 *
 * Traces to: Project 1, Threat #16 (confirmed live via Vercel function
 * logs, digest 332712304 — a genuine production crash, not theoretical).
 * Project 2, TICKET-12, Deliverable 1 Rule 5.
 *
 * Honesty note on what this test does and doesn't prove: the original
 * bug was a genuine two-request race condition. This test does not spin
 * up two concurrent real requests against a real database — that would
 * be a flaky, timing-dependent integration test, not a reliable CI
 * regression test. Instead, it tests the specific, deterministic thing
 * that actually matters: given that prisma.user.upsert() throws a P2002
 * (which is exactly what happens when the race is lost, regardless of
 * timing), does getCurrentUser() recover correctly, or does the error
 * still propagate to an unhandled exception? That's the actual
 * regression surface — the race's *timing* isn't the bug, the *missing
 * error handling* was.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prismaMock } from "./__mocks__/prisma";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, UnauthenticatedError } from "@/lib/auth";

const TEST_USER_ID = "user_regression_test_jit";

function makeP2002Error() {
  // Matches the real shape confirmed in Project 1's Vercel log evidence:
  // PrismaClientKnownRequestError with code "P2002" on the User.email
  // unique constraint.
  return new PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`email`)",
    { code: "P2002", clientVersion: "5.20.0" }
  );
}

describe("getCurrentUser() — JIT provisioning race condition (Threat #16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UnauthenticatedError when there is no active session (baseline, unrelated to the race)", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    await expect(getCurrentUser()).rejects.toThrow(UnauthenticatedError);
  });

  it("returns the user normally when upsert succeeds (no race occurred)", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: TEST_USER_ID } as any);
    const createdUser = {
      id: TEST_USER_ID,
      email: `${TEST_USER_ID}@placeholder.local`,
      role: "MEMBER",
      apiKey: null,
    };
    prismaMock.user.upsert.mockResolvedValue(createdUser as any);

    const result = await getCurrentUser();
    expect(result).toEqual(createdUser);
  });

  it("recovers by re-fetching the user when upsert throws P2002 (the race was lost, winning request's row exists)", async () => {
    // This is the exact regression case: two near-simultaneous requests
    // for the same brand-new user. This request loses the race — its
    // upsert() throws P2002 because the OTHER request's row already
    // exists. Before the fix, this error propagated uncaught to a 500
    // (Project 1, Threat #16, digest 332712304). After the fix, it must
    // recover by re-fetching the row the winning request created.
    vi.mocked(auth).mockResolvedValue({ userId: TEST_USER_ID } as any);
    prismaMock.user.upsert.mockRejectedValue(makeP2002Error());

    const winningRequestsRow = {
      id: TEST_USER_ID,
      email: `${TEST_USER_ID}@placeholder.local`,
      role: "MEMBER",
      apiKey: null,
    };
    prismaMock.user.findUnique.mockResolvedValue(winningRequestsRow as any);

    const result = await getCurrentUser();

    expect(result).toEqual(winningRequestsRow);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: TEST_USER_ID } });
  });

  it("re-throws the original P2002 if the re-fetch also finds nothing (does not silently swallow an unrecoverable state)", async () => {
    // Guards against over-correcting: the fix should recover from the
    // specific, foreseeable race, not blanket-suppress every P2002.
    vi.mocked(auth).mockResolvedValue({ userId: TEST_USER_ID } as any);
    const error = makeP2002Error();
    prismaMock.user.upsert.mockRejectedValue(error);
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(getCurrentUser()).rejects.toThrow(error);
  });

  it("does not catch and does not recover from a non-P2002 Prisma error", async () => {
    // Confirms the fix is scoped to P2002 specifically, not "catch
    // everything from upsert" — an unrelated database error (e.g.
    // connection failure) must still propagate normally.
    vi.mocked(auth).mockResolvedValue({ userId: TEST_USER_ID } as any);
    const unrelatedError = new PrismaClientKnownRequestError("Connection timed out", {
      code: "P1001",
      clientVersion: "5.20.0",
    });
    prismaMock.user.upsert.mockRejectedValue(unrelatedError);

    await expect(getCurrentUser()).rejects.toThrow(unrelatedError);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
