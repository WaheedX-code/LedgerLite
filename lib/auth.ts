import { auth } from "@clerk/nextjs/server";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
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
 * first sight (JIT provisioning) so we never trust client-supplied identity. 
 
 * Coding standard (Project 2, Rule 5 / TICKET-12): this upsert's `where`
 * clause is keyed on `id`, but `create` also writes `email`, a field with
 * its own independent unique constraint. If two near-simultaneous requests
 * for the same brand-new user both reach the `create` branch before either
 * transaction commits (observed in production — see Project 1, Threat #16,
 * digest 332712304), the first INSERT succeeds and the second throws a
 * Prisma P2002 unique-constraint error that this function must not let
 * propagate to an unhandled 500. On that specific, foreseeable race, we
 * re-fetch by `id`: the winning concurrent request will have created the
 * row by the time this catch runs. */
export async function getCurrentUser(): Promise<User> {
  const { userId } = await auth();
  if (!userId) throw new UnauthenticatedError("No active session");

  try {
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
  } catch (e) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      // Lost the create race to a concurrent request for the same user.
      // That request's row now exists — re-fetch it rather than fail.
      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (existing) return existing;
      // Vanishingly unlikely (the winning row would have to be deleted
      // between the P2002 and this re-fetch), but don't silently swallow
      // a state we can't actually recover from.
      throw e;
    }
    throw e;
  }
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
