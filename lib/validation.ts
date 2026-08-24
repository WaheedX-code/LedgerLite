import { z } from "zod";

/**
 * INPUT VALIDATION — every route handler parses request bodies through one
 * of these schemas before touching Prisma. Never pass req.json() straight
 * into a Prisma call: that's how mass-assignment and type-confusion bugs
 * happen (e.g. a client sneaking an `ownerId` or `role` field into a POST body).
 */

export const invoiceItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive().max(100000),
  unitPriceCents: z.number().int().nonnegative().max(100_000_000),
});

export const createInvoiceSchema = z.object({
  clientName: z.string().min(1).max(200),
  dueDate: z.string().datetime(),
  items: z.array(invoiceItemSchema).min(1).max(100),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(["draft", "sent", "paid"]),
});

/**
 * Coding standard (Project 2, Rule 4 / TICKET-04): a Zod enum check on the
 * NEW value of a lifecycle field is necessary but not sufficient — it says
 * nothing about whether the transition FROM the current value is legal.
 * lib/validation.ts's updateInvoiceStatusSchema above only ever validated
 * the new value in isolation, which is how a MEMBER could PATCH a `paid`
 * invoice straight back to `draft` (Project 1, Threat #4 / SR-1).
 *
 * This table is the minimum transition set SR-1 requires: a MEMBER may
 * only move a status forward (draft -> sent -> paid). Any transition not
 * listed here — including any reversal — is rejected for non-ADMIN callers
 * at the route level (see app/api/invoices/[id]/route.ts PATCH handler).
 * ADMIN bypasses this table entirely, consistent with assertOwnerOrAdmin's
 * existing all-access-for-ADMIN pattern in lib/auth.ts.
 *
 * Product decision flagged, not assumed: SR-1 only specifies that
 * `paid -> draft` and `paid -> sent` must be rejected for MEMBER callers.
 * It does not say whether ANY reversal should ever be MEMBER-permitted.
 * This table takes the strict reading (forward-only for MEMBER, no
 * reversals at all) as the safer default. If product wants to allow a
 * MEMBER to revert `sent -> draft` (e.g. to fix a typo before a client
 * sees it), that's a one-line change to this table — call it out
 * explicitly in review rather than silently assume it either way.
 */
export const LEGAL_INVOICE_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["paid"],
  paid: [],
};

export function isLegalInvoiceStatusTransition(
  currentStatus: string,
  newStatus: string
): boolean {
  if (currentStatus === newStatus) return false; // no-op writes aren't a "transition"
  return LEGAL_INVOICE_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

export const createExpenseSchema = z.object({
  description: z.string().min(1).max(200),
  amountCents: z.number().int().nonnegative().max(100_000_000),
  category: z.string().min(1).max(100),
  incurredAt: z.string().datetime(),
});

/** Escapes any string field before it's ever rendered client-side outside of
 * React's default JSX escaping — e.g. if a value is dropped into an email
 * template or CSV export later (Product C's integrations). React already
 * escapes JSX interpolation by default, so this is a deliberate backstop
 * for the non-JSX rendering paths, not a redundant safeguard. */
export function escapeForNonJsxOutput(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
