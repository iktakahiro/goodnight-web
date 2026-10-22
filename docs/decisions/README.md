# Decision records

This directory holds architecture decision records (ADRs) for goodnight-web.

Add one file per decision, named `NNNN-short-title.md` with a four-digit
sequence number (for example `0001-admin-ui-delivery.md`). Each record states
the context, the decision, and its consequences. Do not rewrite an accepted
record; supersede it with a new one and link both ways.

## Index

| No.                                              | Decision                                                  | Status   |
| ------------------------------------------------ | --------------------------------------------------------- | -------- |
| [0001](0001-passkey-auth-on-workers.md)          | Passkey sign-in with Better Auth on Workers and D1        | accepted |
| [0002](0002-migrations-from-package.md)          | Ship D1 migrations inside `@goodnight-web/server`         | accepted |
| [0003](0003-rate-limit-binding.md)               | Rate-limit the contact API with the Rate Limiting binding | accepted |
| [0004](0004-admin-ui-delivery.md)                | Deliver the admin UI from the Worker bundle               | accepted |
| [0005](0005-drizzle-orm.md)                      | Drizzle ORM for D1 access and migrations                  | accepted |
| [0006](0006-admin-sessions-and-setup-closure.md) | Admin sessions and setup closure                          | accepted |
| [0007](0007-honeypot-not-stored.md)              | Honeypot submissions are not stored                       | accepted |
| [0008](0008-contact-form-definition-in-d1.md)    | Contact form definition in D1 with immutable field ids    | accepted |
