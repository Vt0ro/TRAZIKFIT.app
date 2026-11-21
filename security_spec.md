# Trazik Fit — Security Specification

## 1. Data Invariants
1. **Default Athlete Role**: Any authenticated user without a document in `/roles/{uid}` is strictly an `athlete`. Only verified admins can write `/roles/{uid}`, and non-owner users can never escalate their own role or set `admin: true` unless granted by an existing admin.
2. **Owner Pinning**: `/config/owner` can only be created once (`!ownerPinned()`) by a verified owner email matching the bootstrapped owner email list, and `uid` must match `request.auth.uid`.
3. **Coach-Athlete Link Integrity**: A trainer can read a student's `/users/{uid}` and read/write `/users/{uid}/sessions/{sid}` (and update only `cplans`/`cts` on `/users/{uid}`) if and only if the trainer's `uid` is present in `users/{uid}.coaches`. An athlete can only add a trainer UID to `coaches` if a valid invitation exists at `/invites/{coachUid}_{athleteEmail}` created by a verified trainer.
4. **PII Isolation**: Email addresses and personal profiles in `/directory/{uid}` and `/users/{uid}` are never exposed to unauthenticated users or unrelated signed-in users (`allow list` always enforces owner, linked coach, or admin).
5. **Immutable & Bounded Payloads**: Document IDs match `^[a-zA-Z0-9_\-]+$` (or `{coachUid}_{email}` for invites), all string fields enforce `.size()` bounds, `coaches` is capped at 10 entries, and `exercises` is capped at 80 entries per session.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated read on `/users/valU`** (`auth: null`) -> DENIED.
2. **Self-escalation on `/roles/{uid}`** (athlete writes `{ role: 'trainer', admin: true }`) -> DENIED.
3. **Self-linking unauthorized coach on `/users/{uid}`** (athlete appends `badCoachUid` to `coaches` without an existing `/invites/badCoachUid_{email}`) -> DENIED.
4. **Trainer hijacking athlete profile** (linked trainer updates `coaches` or `meta` on `/users/{uid}` instead of only `cplans`/`cts`) -> DENIED.
5. **Unlinked trainer reading `/users/{uid}/sessions/{sid}`** (trainer not in `users/{uid}.coaches`) -> DENIED.
6. **Athlete creating invite** (non-trainer creates `/invites/{uid}_victim@gmail.com`) -> DENIED.
7. **Spoofed email invite read** (user with `email_verified: false` attempts to read `/invites/{coachUid}_{email}`) -> DENIED.
8. **Shadow field injection on `/directory/{uid}`** (adding `role: 'trainer'` or `isVerified: true` alongside valid fields) -> DENIED.
9. **Oversized string poisoning on `/users/{uid}/sessions/{sid}`** (`notes` > 2000 chars or `id` > 128 chars) -> DENIED.
10. **Admin deleting owner role** (admin attempts `delete` on `/roles/{ownerUid}`) -> DENIED.
11. **Admin tampering with audit trail** (admin attempts `update` or `delete` on `/roleAudit/{id}`) -> DENIED.
12. **Blanket query scraping on `/directory`** (non-admin attempts `list` on `/directory`) -> DENIED.
