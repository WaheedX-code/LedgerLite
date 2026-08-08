import { auth } from "@clerk/nextjs/server";
import { prisma } from "./prisma";
import type { User } from "@prisma/client";

/**
 * AUTHORIZATION — single source of truth.
 *
 * Coding standard (Project 2): NO route handler queries Prisma for a User's
 * own resources without going through getCurrentUser()/requireOwnerOrAdmin()
 * below. Access control lives HERE, once, not re-implemented per route —
 * that duplication is exactly how BOLA (Broken Object Level Authorization)
 * bugs get introduced. See Project 3 brief for the OWASP API Top 10 mapping.
 */

export class UnauthenticatedError extends Error {}
export class ForbiddenError extends Error {}

/** Resolves the Clerk session to our local User row. Creates the row on
 * first sight (JIT provisioning) so we never trust client-supplied identity. */
export async function getCurrentUser(): Promise<User> {
  const { userId } = await auth();
  if (!userId) throw new UnauthenticatedError("No active session");

  const user = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `${userId}@placeholder.local`, // replaced by a Clerk webhook in production; see README
      role: "MEMBER",
    },
  });
  return user;
}

export function requireAdmin(user: User) {
  if (user.role !== "ADMIN") {
    throw new ForbiddenError("Admin role required");
  }
}

/** Enforces: a MEMBER may only touch resources they own; an ADMIN may touch any.
 * This is the exact check Project 3's access-control tests assert against. */
export function assertOwnerOrAdmin(user: User, resourceOwnerId: string) {
  if (user.role === "ADMIN") return;
  if (user.id !== resourceOwnerId) {
    throw new ForbiddenError("You do not have access to this resource");
  }
}

/** Validates the x-api-key header used by the public integration endpoint
 * (Project 3's OWASP API Top 10 target). Constant-time-ish comparison via
 * a DB lookup rather than string equality on a request-supplied value alone. */
export async function getUserByApiKey(apiKey: string | null): Promise<User | null> {
  if (!apiKey) return null;
  return prisma.user.findUnique({ where: { apiKey } });
}
