# 0007. Honeypot submissions are not stored

- Status: accepted
- Date: 2026-10-22

## Context

The first contact API stored a submission with a filled honeypot field as a
`held` row and answered with success. The honeypot check runs before
Turnstile, so these rows were written without passing Turnstile. The only
limit was the per-address rate limit, so the number of rows grew with the
number of addresses a bot controls (security audit 2026-10-22, lead N1). A
held row also kept the raw, untrimmed message, which reached the CSV export
(lead N6).

## Decision

When the honeypot field is filled, `POST /api/contact`:

- still counts the request against `CONTACT_RATE_LIMITER` (key `ip_hash`), so
  the same address cannot follow up with real submissions at full speed;
- logs one line, `contact: honeypot filled; nothing stored`, with no personal
  data;
- stores nothing;
- answers `{ "ok": true }`, so the bot learns nothing.

## Alternatives considered

- **Verify Turnstile first and store only when it passes.** Rejected. A
  filled honeypot means a bot by definition; a held row of it has no value
  that is worth a siteverify call and a D1 write.
- **Store a small marker row without personal data or body.** Rejected.
  Nothing reads such rows; a count would only add writes. The log line gives
  operators the same signal.

## Consequences

- A real visitor whose browser fills the hidden field (for example an
  aggressive autofill) loses the message. The field is hidden, labelled for
  bots only, and has `autocomplete="off"`, so this should be rare.
- The `honeypot` spam reason no longer appears in stored rows.
