# 0009. Unread/read status, a suspected spam flag, and stored honeypot hits

- Status: accepted
- Date: 2026-10-22
- Supersedes: [0007](0007-honeypot-not-stored.md)

## Context

A submission had five statuses: `new`, `read`, `done`, `held`, and `spam`.
`held` was set by a high spam score; `done` and `spam` were set by admins.
Two different questions shared one field: "have I read it?" and "is it
spam?". Marking a held message as read lost the fact that it looked like
spam, and the people who run a goodnight-web site rarely need a workflow
state such as `done`.

A filled honeypot was answered with success and not stored at all
([0007](0007-honeypot-not-stored.md)). A real visitor whose browser or
password manager filled the hidden field (it was named `website`, which
invites autofill) lost the message without anyone knowing.

The admin list could be sorted by email address and status, and had no
search. Admins look for an inquiry by when it arrived or by who sent it.

## Decision

- **Status is `unread` or `read` only.** Opening the detail marks it read;
  an admin can set it back to unread from the list or the detail. `read_at`
  is cleared when it goes back to unread.
- **Suspected spam is a separate flag**, `suspected_spam` (integer boolean,
  NOT NULL, default false). The contact API sets it when the honeypot is
  filled or the spam score is at least `SPAM_SUSPECT_THRESHOLD` (3, renamed
  from `SPAM_HOLD_THRESHOLD`). Admins clear or set it in the detail ("Not
  spam" / "Mark as spam"). Suspected spam gets no Slack notification and is
  not in the unread count.
- **Honeypot hits are stored, after Turnstile.** The honeypot field is
  renamed `gnw_hp_x` and carries `autocomplete="off"` and the opt-out
  attributes of common password managers (`data-1p-ignore`,
  `data-lpignore="true"`, `data-bwignore`, `data-form-type="other"`). A
  filled honeypot no longer short-circuits the request: it goes through
  Turnstile, the rate limit, and validation like any submission, and is then
  stored with `suspected_spam = 1` and the reason `honeypot`. If any of
  those steps fails, the client gets the same error as without the honeypot
  and nothing is stored. The client therefore always gets the same response
  as for an identical request without the honeypot. The honeypot value is
  never stored.
- **The admin list** has one segmented control with four views: Unread,
  Read, All (the default), and Suspected spam. The first three leave
  suspected spam out and say where it is; the last shows only suspected
  spam, read and unread. The list is sorted by received time only (newest
  first, or oldest first). One search box matches part of the email address,
  ignoring case: Drizzle's `like` on `lower(email)`, the term lower-cased,
  `%`, `_`, and `\` escaped, one bound parameter, `ESCAPE '\'`. No index is
  added for it. The version and option filters stay.
- **Migration `0006_unread_read_status.sql`** changes the check constraint,
  which in SQLite means rebuilding `submissions`. The generated copy is
  edited to map the old values: `new` becomes `unread`, every other status
  becomes `read`, and `held` and `spam` rows get `suspected_spam = 1`.

## Alternatives considered

- **Keep `held` and `spam` as statuses.** Rejected: one field cannot say
  both "read" and "looks like spam".
- **Keep the stored value `new` for unread.** It would have kept the old
  Worker's inserts valid during a deploy. Rejected because no version has
  been released, so no deployed Worker writes `new`, and one name in the
  database, the API, and the UI is simpler. After the first release, a
  change like this must stay additive.
- **Store honeypot hits before Turnstile, as the first API did.** Rejected
  for the reason in 0007: a bot could write to D1 without passing Turnstile.
- **Keep answering every honeypot hit with success.** Rejected: a real
  visitor whose browser filled the field would see "sent" while nothing was
  saved after a validation or Turnstile error. Answering exactly as without
  the honeypot loses nothing and tells a bot nothing.
- **An index for the email search.** Rejected: `LIKE '%term%'` cannot use a
  B-tree index. A contact form gets a few thousand rows a year, pruned after
  the retention period, so a full scan reads few rows; an index would slow
  every insert and not help.
- **Search over the form fields.** Rejected for the reasons in 0008.

## Consequences

- Suspected spam no longer hides among real inquiries or inflates the
  unread count, and nothing flagged is lost.
- A bot that passes Turnstile and fills the honeypot can add rows up to the
  rate limit (per `ip_hash`), the same as without the honeypot. They are
  flagged and pruned with the retention period.
- `SPAM_HOLD_THRESHOLD`, `SUBMISSION_SORT_COLUMNS`, and the `sort` and
  `status` query parameters are gone from the package's public API; the list
  takes `view`, `q`, and `dir`. The CSV has a `suspected_spam` column.
- `0006` is the second non-additive migration, made before the first
  release like `0005`.
