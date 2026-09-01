import { NextRequest, NextResponse } from "next/server";
import { getUserByApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PUBLIC INTEGRATION ENDPOINT — deliberately separate from the session-based
 * /api/invoices routes above. This is the endpoint Project 3's OWASP API
 * Top 10 audit targets. Findings this route is built to demonstrate/fix:
 *
 *  - API1 Broken Object Level Authorization: a caller with a valid key for
 *    User A must NOT be able to fetch User B's invoice by guessing/incrementing
 *    an ID. Enforced below via the ownerId check, same pattern as assertOwnerOrAdmin.
 *  - API4 Unrestricted Resource Consumption: rate limiting belongs at the edge
 *    (Cloudflare, Product B) — this route assumes it's NOT the only control.
 *  - API2 Broken Authentication: the API key is opaque and stored as a
 *    SHA-256 hash (User.apiKey), never in plaintext. TICKET-02/TICKET-07
 *    (Project 3): getUserByApiKey() in lib/auth.ts hashes the incoming
 *    x-api-key header with the same hashApiKey() function used at
 *    generation time before querying — see tests/api-key-auth.test.ts.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const apiKey = req.headers.get("x-api-key");
  const user = await getUserByApiKey(apiKey);

  if (!user) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: params.id } });

  // BOLA check: the invoice must belong to the API key's owner.
  // Returning 404 (not 403) avoids confirming to an attacker that a given
  // ID exists but belongs to someone else.
  if (!invoice || invoice.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Deliberately minimal response shape — no internal fields (ownerId,
  // timestamps) leaked to third-party integrations that don't need them.
  return NextResponse.json({
    id: invoice.id,
    clientName: invoice.clientName,
    amountCents: invoice.amountCents,
    status: invoice.status,
    dueDate: invoice.dueDate,
  });
}
