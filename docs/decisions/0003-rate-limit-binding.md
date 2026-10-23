# 0003. Rate-limit the contact API with the Rate Limiting binding

- Status: accepted
- Date: 2026-10-22

## Context

The contact API limits submissions per `ip_hash`. We cannot use KV or Durable
Objects, and Better Auth's in-memory rate limiter does not work across
isolates. The Workers Rate Limiting binding is configured in `wrangler.jsonc`
and needs no extra service.

Questions: does the config pass `wrangler deploy --dry-run`, and does the
binding work under `wrangler dev` so we can test it locally?

## What we tested

`wrangler` 4.151.2 (workerd 1.20261019.1), `compatibility_date` 2026-10-15.

```jsonc
"ratelimits": [
  {
    "name": "CONTACT_RATE_LIMITER",
    "namespace_id": "1001",
    "simple": { "limit": 5, "period": 60 }
  }
]
```

```ts
const { success } = await env.CONTACT_RATE_LIMITER.limit({ key });
return Response.json({ key, success }, { status: success ? 200 : 429 });
```

```sh
wrangler deploy --dry-run
wrangler dev --port 8813 --ip 127.0.0.1
for i in 1 2 3 4 5 6 7; do curl -s "localhost:8813/?key=ip-hash-a"; echo; done
curl -s "localhost:8813/?key=ip-hash-b"
```

## Results

- `wrangler deploy --dry-run` passed. It listed the binding as
  `env.CONTACT_RATE_LIMITER (5 requests/60s)  Rate Limit`.
- `wrangler dev` ran the binding in local mode. Requests 1–5 for one key
  returned `success: true`; requests 6 and 7 returned `success: false`.
- Another key was counted separately (`success: true`).
- Several minutes later, the same key was allowed five more times and then
  blocked again.
- Config checks: `"period": 30` fails with
  `"simple.period" must be either 10 or 60 but got 30`. Leaving out
  `namespace_id` fails with `must have a string "namespace_id" field`.

## Decision

- Use the Rate Limiting binding for `/api/contact`, keyed by `ip_hash`, after
  Turnstile verification and before validation. Over the limit returns 429.
- The starter's `wrangler.jsonc` defines the binding with a fixed name that
  the package expects. The binding name is on the list of things users do not
  change.
- Tests for the 429 path can run against `wrangler dev`, because the local
  binding enforces the limit.

## Open issues

- `namespace_id` is any number chosen by us, but counters are shared by every
  Worker in the same Cloudflare account that uses the same `namespace_id`. A
  user with two goodnight-web sites in one account would share counters. Keys
  are `ip_hash` values with a per-site secret, so they will not collide, but
  document this.
- Choose the default limit and period. `period` can only be 10 or 60 seconds.
- Not tested: behavior on Cloudflare. Cloudflare's documentation describes the
  limit as counted per location and not exact, so it is a guard against floods,
  not a strict quota.
- Not tested: the Deploy to Cloudflare button with this binding. That needs a
  public repository and the package on npm.
