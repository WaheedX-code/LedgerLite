/**
 * Shared Prisma mock, used by every test file in this suite.
 *
 * Uses vitest-mock-extended's mockDeep<PrismaClient>() rather than
 * hand-rolling a separate mock object per test file. This is the pattern
 * Prisma's own documentation recommends (prisma.io/docs/orm/prisma-client
 * /testing/unit-testing) and the current, actively-maintained approach as
 * of this project (confirmed: vitest-mock-extended v5.1.1, MIT, published
 * within the last day at time of writing — passes Deliverable 2's own
 * maintenance bar).
 *
 * Why this replaces the earlier hand-rolled `vi.mock("@/lib/prisma", ...)`
 * pattern used in an earlier draft of this suite: mockDeep<PrismaClient>()
 * generates a fully-typed mock directly from the real Prisma client type,
 * so it (a) stays correct automatically as the schema grows — no need to
 * remember to add a new hand-written stub every time a route starts using
 * a new Prisma method — and (b) fails as a compile error on a typo'd
 * method name instead of silently resolving to undefined at runtime.
 */
import { beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

export const prismaMock = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});
