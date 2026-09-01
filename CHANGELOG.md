# Changelog

This file's initial purpose is narrow and deliberate: it is the audit trail
for admin role grants, required by Project 3, Deliverable 9 (Admin Access
Governance Policy). See that policy for the full grant process — this file
is where every grant gets recorded once it happens.

Why this file, and not a database table: there is currently no durable,
platform-level audit trail for role changes (Vercel's audit log is
Enterprise-tier only; Neon's free-tier query history does not persist
across compute suspend/resume). Recording each grant here means the
record survives accidental loss or forgetting, and altering an entry
after the fact requires a deliberate, visible commit rather than a
silent edit.

Limitation, stated plainly rather than implied away: this is NOT an
independently tamper-evident audit trail. In a single-owner project, the
person authorized to grant ADMIN (Deliverable 9) and the person with
push access to this file are the same person — there is no separation
of duties. Someone with repo write access could edit or remove a past
entry, or rewrite git history entirely. This file is a self-reported,
manual control, not a technical guarantee against the person it is
meant to be recording. That is the accepted, named tradeoff for a
project at this size (Deliverable 9); a real fix would require a
second party with independent write access, or an append-only external
log, neither of which exists here.

## Admin role grants

### 2026-09-01 — user_3IArEqcH9u3H...

- **Granted by:** repository owner, via the manual SQL step documented in
  README.md ("Set the first admin"):
  `UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';`
- **Reason:** first admin account for this project, set during Project 1
  (Threat modeling & Secure Design)
- **Reviewed by:** N/A — single-owner project at time of grant, consistent
  with Deliverable 9's policy for how a single-approver process is
  expected to work at this project's current size.

