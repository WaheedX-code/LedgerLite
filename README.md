# LedgerLite

Invoicing and expenses, kept plainly. Built as **Product A** for the Expadox
Portfolio Product Security track — this repo is the code artifact for
**Projects 1-3**:

1. **Threat Modeling & Secure Design**
2. **Secure Coding & CI/CD AppSec Pipeline**
3. **AuthN/AuthZ & API Hardening**

Every other Project 1-3 deliverable (the threat model doc, the coding
standards doc, the OWASP API Top 10 audit writeup) lives alongside this repo
as separate documents — this README covers the code and how to run it.

---

## What it is

A small SaaS for tracking invoices and expenses. It has just enough surface
to be a real product security exercise — authentication, role-based access,
forms that take money-adjacent data, and a public API — without needing a
server you manage or a cloud bill.

- Sign up / sign in (Clerk)
- Create, view, and update invoices (client, line items, due date, status)
- Log expenses
- Two roles: `MEMBER` (sees only their own data) and `ADMIN` (sees everyone's)
- A public, API-key-authenticated endpoint for a hypothetical accounting
  integration: `GET /api/v1/invoices/:id`

---

## Design notes

The visual direction is **"the physical ledger book"** rather than a generic
SaaS dashboard: ruled horizontal lines under every row (`.ledger-row` in
`globals.css`), right-aligned tabular-mono numerals for every amount, and a
paper-and-ink palette (`paper` #FAF9F4, `ink` #1B2430, `forest` #3F6259 for
paid, `amber` #C98A3E for pending, `rust` #B4483A for destructive actions).
Source Serif 4 for headings, Inter for body, JetBrains Mono for anything
that's a number — because in a real ledger, the numbers are the point.

---

## Tech stack — all third-party, all free tier, nothing self-hosted

| Layer | Service | Why |
|---|---|---|
| Frontend + backend | **Next.js 14** (App Router, Route Handlers) on **Vercel** free tier | One repo, one deploy target, no separate backend to host or patch |
| Auth | **Clerk** free tier | Full authentication out of the box — sessions, sign-up/in UI, social login. This repo implements authorization (roles) on top, not raw password/session handling |
| Database | **Neon** (serverless Postgres) free tier, via **Prisma** | No server to provision, scales to zero when idle |
| Validation | **Zod** | Every API route parses the request body through a schema before touching the database |
| CI/CD security | **GitHub Actions** (free for public repos): Gitleaks, Semgrep, `npm audit`, Anchore SBOM action | Runs on every PR — see `.github/workflows/security.yml` |
| Edge / DNS / WAF | **Cloudflare** free tier | Not required for this repo — introduced properly in Product B (OpsConsole), which is where zero-trust edge access is the point |

Total cost to run this: **$0**, comfortably within every free tier above at
portfolio-demo traffic levels.

---

## Deploy steps (zero overhead, ~20 minutes)

### 1. Clone and install
```bash
git clone <your-fork-url> ledgerlite
cd ledgerlite
npm install
cp .env.example .env.local
```

### 2. Database — Neon
1. Sign up at [neon.tech](https://neon.tech) (free, no card required)
2. Create a project, then copy the **pooled connection string**
3. Paste it into `.env.local` as `DATABASE_URL`
4. Push the schema:
   ```bash
   npx prisma migrate dev --name init
   ```

### 3. Auth — Clerk
1. Sign up at [clerk.com](https://clerk.com) (free tier: 10k monthly active users)
2. Create an application, choose email + whichever social providers you want
3. Copy the publishable key and secret key into `.env.local`
4. **Set the first admin:** sign up through the app once, then in Neon's SQL
   console (or Prisma Studio: `npx prisma studio`) run:
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
   ```
   There's no self-serve admin promotion by design — that's a deliberate
   access-control choice worth noting in the Project 3 writeup.

### 4. Run locally
```bash
npm run dev
```
Visit `http://localhost:3000`.

### 5. Deploy — Vercel
1. Push the repo to GitHub
2. Sign up at [vercel.com](https://vercel.com) with your GitHub account (free)
3. Import the repo — Vercel auto-detects Next.js, zero config needed
4. Add the same environment variables from `.env.local` in the Vercel
   dashboard (Project Settings → Environment Variables)
5. Deploy. Every push to `main` auto-deploys; every PR gets its own preview
   URL — this preview URL is what a later canary/staged-rollout gate (Product
   C, Project 9) will use.

### 6. Generate an API key for the public integration endpoint
For testing `/api/v1/invoices/:id`, add an `apiKey` value to a user row
directly (Prisma Studio or SQL), then call:
```bash
curl -H "x-api-key: <the-key>" https://your-app.vercel.app/api/v1/invoices/<invoice-id>
```

### 7. CI/CD security checks
`.github/workflows/security.yml` runs automatically on every PR: secret
scanning (Gitleaks), SAST (Semgrep, OWASP Top Ten ruleset), dependency
auditing (`npm audit`), and SBOM generation (CycloneDX, uploaded as a build
artifact). ERROR-level Semgrep findings block the merge; WARNING-level
findings surface inline on the PR without blocking — document any rule
you tune down in the Project 2 coding-standards doc, with rationale.

No secrets are required to run this pipeline beyond the default
`GITHUB_TOKEN` GitHub provides automatically.

---

## Where the security work actually lives

- `lib/auth.ts` — the single authorization chokepoint. Every route that
  touches a user-owned resource calls `assertOwnerOrAdmin()` from here.
  Nothing re-implements the ownership check inline.
- `lib/validation.ts` — every API route validates input through a Zod
  schema before it reaches Prisma.
- `app/api/v1/invoices/[id]/route.ts` — the public API-key endpoint,
  the Project 3 OWASP API Top 10 audit target, with inline notes on what
  it defends against and what's intentionally simplified for a demo.
- `.github/workflows/security.yml` — the Project 2 AppSec pipeline.
- `next.config.js` — baseline security headers (CSP, X-Frame-Options, etc.)
  applied at the app layer.

## Known simplifications (call these out explicitly in the Project 3 writeup, don't hide them)
- The public API key is stored in plaintext in this demo; a production
  version would store a hash and show the raw key exactly once at creation.
- There's no rate limiting on `/api/v1/*` in this repo — that control is
  intentionally deferred to the edge layer, covered in Product B.
- Admin promotion is a manual SQL step, not a UI flow — acceptable for a
  small team, called out as a gap for anything larger.
