import { prisma } from "@/lib/prisma";
import type { AuditAction, Prisma } from "@prisma/client";

/**
 * AUDIT LOGGING — single write path, same reasoning as lib/auth.ts's
 * assertOwnerOrAdmin(): every route that needs to write an audit entry
 * calls ONE function here, rather than constructing prisma.auditLog.create()
 * independently in each route. Duplicated call sites are exactly how the
 * ForbiddenError->404 mapping in the item routes ended up maintained by
 * hand across four separate files (see the Project 3 RBAC audit) — this
 * function exists so the audit-writing shape can't drift the same way.
 *
 * TICKET-01 / SR-2 (Project 1, Critical; Project 3, Deliverable 10).
 * Two, and only two, event types are logged, matching SR-2's literal text:
 *   (a) any Invoice.status change
 *   (b) any ADMIN read or write of a resource where
 *       resourceOwnerId !== requestingUserId
 *
 * APPEND-ONLY: this file exposes no update or delete function for
 * AuditLog rows, deliberately. If a future need to "correct" an audit
 * entry arises, the correct action is a NEW entry noting the correction,
 * never mutating or removing the original — mutating history is exactly
 * what an audit log exists to prevent, including against the person who
 * wrote the original entry.
 */

export async function logStatusChange(params: {
  actorId: string;
  invoiceId: string;
  invoiceOwnerId: string;
  fromStatus: string;
  toStatus: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: "STATUS_CHANGE" as AuditAction,
      resourceType: "Invoice",
      resourceId: params.invoiceId,
      resourceOwnerId: params.invoiceOwnerId,
      metadata: { from: params.fromStatus, to: params.toStatus } satisfies Prisma.JsonObject,
    },
  });
}

/** Item-level admin cross-tenant access (GET/PATCH/DELETE on a single
 * Invoice or Expense the ADMIN does not own). Call this ONLY when the
 * caller has already been confirmed as ADMIN AND resourceOwnerId !==
 * actorId — this function does not re-check that condition itself, to
 * keep it a pure logging function with no authorization logic of its own
 * (authorization stays in lib/auth.ts, exclusively). */
export async function logAdminCrossTenantAccess(params: {
  actorId: string;
  resourceType: "Invoice" | "Expense";
  resourceId: string;
  resourceOwnerId: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: "ADMIN_CROSS_TENANT_ACCESS" as AuditAction,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      resourceOwnerId: params.resourceOwnerId,
    },
  });
}

/** Collection-level admin cross-tenant access (GET /api/invoices or
 * GET /api/expenses returning at least one row the ADMIN does not own).
 * Deliberately ONE entry per qualifying request, not one per row — see
 * the Project 3 walkthrough for why a per-row log was rejected as too
 * noisy for routine admin dashboard usage. resourceId and
 * resourceOwnerId are null here because a single collection request may
 * span many resources and many owners; the entry records that the
 * access happened, not which specific rows were included. */
export async function logAdminCrossTenantListAccess(params: {
  actorId: string;
  resourceType: "Invoice" | "Expense";
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: "ADMIN_CROSS_TENANT_ACCESS" as AuditAction,
      resourceType: params.resourceType,
      resourceId: null,
      resourceOwnerId: null,
    },
  });
}
