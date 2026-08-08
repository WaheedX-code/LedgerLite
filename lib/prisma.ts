import { PrismaClient } from "@prisma/client";

// Singleton pattern prevents exhausting Neon's connection limit on every
// hot-reload in dev, and avoids opening a new pool per serverless invocation.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
