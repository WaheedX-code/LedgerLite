import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUser, UnauthenticatedError, hashApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * TICKET-11 (Project 1 → Project 2, UI half / Project 3, issuance-logic
 * half). This route is the Project-2-owned piece: giving a real,
 * legitimate LedgerLite user a way to generate and revoke their own
 * public API key, closing the gap Project 1's Threat #17 documented
 * ("no dashboard UI, no API route, no automatic generation exists
 * anywhere in the codebase" — confirmed via runtime evidence that real
 * sign-ups never received a key).
 *
 * Explicit scope boundary, stated here rather than silently blurred:
 * this route hashes the key at generation time (SHA-256) rather than
 * storing it in plaintext, because shipping a NEW plaintext-secret
 * write path would directly reproduce Threat #8 — that is a baseline
 * safety requirement for building this feature at all, not scope creep
 * into Project 3's territory.
 *
 * TICKET-02 / TICKET-07 (Project 3) status: CLOSED. lib/auth.ts's
 * getUserByApiKey() now hashes the incoming raw key with the same
 * hashApiKey() function this route uses (imported from lib/auth.ts, not
 * duplicated here) before querying User.apiKey. A key generated here now
 * DOES successfully authenticate against GET /api/v1/invoices/:id — see
 * tests/api-key-auth.test.ts for the regression coverage proving this,
 * and the Project 3 walkthrough for the reproduction that found the
 * original break. Scope/permission metadata on the key remains a
 * separate, not-yet-scoped enhancement.
 */

function generateRawKey(): string {
  // 32 random bytes, base64url-encoded — sk_live_-style prefix so it's
  // recognizable as a LedgerLite key in logs/screenshots without
  // resembling a real Stripe/Clerk key (see Project 1, Evidence Item 6,
  // for why using a realistic-looking fake key format matters when
  // testing — the same reasoning applies here in reverse: a real key
  // should NOT be mistakable for a well-known vendor's format).
  const random = crypto.randomBytes(32).toString("base64url");
  return `llk_live_${random}`;
}

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const rawKey = generateRawKey();
    const hashed = hashApiKey(rawKey);

    await prisma.user.update({
      where: { id: user.id },
      data: { apiKey: hashed },
    });

    // The raw key is returned exactly once, in this response, and never
    // again — it is not retrievable through any subsequent GET, matching
    // SR-3's requirement ("the raw key is displayed to the user exactly
    // once, at generation time, and is not retrievable afterward").
    return NextResponse.json({ apiKey: rawKey }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { apiKey: null },
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}

export async function GET(_req: NextRequest) {
  // Confirms whether a key exists WITHOUT ever returning it — the raw
  // value is never retrievable after generation (SR-3), and now that
  // apiKey stores a hash, returning it would be useless to the caller
  // even if we did.
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ hasApiKey: Boolean(user.apiKey) });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}


