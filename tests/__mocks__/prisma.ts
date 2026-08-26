/**
 * Shared Prisma mock, used by every test file in this suite.
 *
 * Uses vitest-mock-extended's mockDeep<PrismaClient>(). This is the pattern
 * Prisma's own documentation recommends (prisma.io/docs/orm/prisma-client
 * /testing/unit-testing) and the current, actively-maintained approach as
 * of this project.
 */
import { beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

export const prismaMock = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});
