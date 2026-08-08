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
