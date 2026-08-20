# Architecture

## Components

```
                         ┌─────────────────────────┐
  HTTP request  ───────► │   Express app (app.ts)   │
                         │  ┌─────────────────────┐ │
                         │  │ requestLogger (pino) │ │
                         │  ├─────────────────────┤ │
                         │  │ rate limiters        │ │  per-route, per-IP
                         │  ├─────────────────────┤ │
                         │  │ routes:               │ │
                         │  │  POST   /api/urls    ─┼─┼──► urls.controller ──► urls.service ──► urls.repository ──► SQLite
                         │  │  GET    /api/urls/:c  │ │                              │
                         │  │  GET    /api/urls/:c  │ │                              ├─ TtlCache (redirect hot path)
                         │  │         /analytics    │ │                              │
                         │  │  DELETE /api/urls/:c  │ │                              └─ userAgent.ts (parse/bucket)
                         │  │  GET    /:shortCode  ─┼─┼──► redirect.controller ──► urls.service
                         │  └─────────────────────┘ │
                         │  errorHandler / 404       │
                         └─────────────────────────┘
```

- **`app.ts`** — Express app assembly: middleware order, route mounting. No business logic.
- **`modules/urls/`** — the one real domain module, layered `routes → controller → service →
  repository`. `redirect.controller.ts` is separate from `urls.controller.ts` because it's
  mounted at the root path (`GET /:shortCode`) rather than under `/api/urls`, but both share the
  same `UrlsService`.
- **`db/`** — a single `better-sqlite3` connection (module-level singleton via `getDb()`) and a
  small hand-rolled migration runner (`migrate.ts`) that applies numbered `.sql` files in
  `db/migrations/` and tracks what's been applied in a `_migrations` table. No ORM: the schema is
  small enough (two tables) that raw SQL with prepared statements is more legible than an
  abstraction layer would be, and prepared statements already give parameterized-query safety.
- **`middleware/`** — cross-cutting concerns (logging, rate limiting, error translation) kept out
  of route handlers.
- **`lib/`** — small, dependency-light utilities (`cache.ts`, `errors.ts`, `logger.ts`,
  `userAgent.ts`) with no knowledge of the `urls` domain, reusable if a second domain module were
  ever added.

## Control flow

**Create** (`POST /api/urls`): validate body with `zod` (rejects malformed URLs, disallowed
schemes, self-referential URLs, invalid aliases) → for a custom alias, attempt one atomic insert
and translate a collision into `409 Conflict`; for a generated code, retry up to 5 times against
fresh random codes, translating persistent failure into `503` → return the created link.

**Redirect** (`GET /:shortCode`): check the in-memory cache, fall back to a DB lookup and populate
the cache on miss → reject with `404`/`410` if missing, deactivated, or expired → record the click
(referrer bucketed to a host, user-agent parsed to browser/OS) synchronously, *then* send the
redirect. Click recording happens before the redirect response, not after — see
[`docs/ai-traceability.md`](docs/ai-traceability.md) for why an async "fire and forget" version
was rejected.

**Analytics** (`GET /api/urls/:code/analytics`): total click count, last-clicked timestamp, and a
grouped breakdown (`GROUP BY ... ORDER BY count DESC LIMIT 10`) by referrer host, browser, and OS.

**List** (`GET /api/urls`): every link ever created, newest first, each with a per-link click
count via a `LEFT JOIN` against `clicks` (so zero-click links still appear). Capped at 100 rows,
no pagination — a deliberate prototype-scale limitation (see `ENGINEERING_SUMMARY.md`), not an
oversight. Backs the "Your links" table in `public/index.html`.

## Data model
Two tables, two migrations (`db/migrations/001_init.sql`, `002_add_click_breakdown_columns.sql`):

- **`urls`**: `short_code` (unique), `long_url`, `custom_alias` (flag), `is_active` (soft delete),
  `created_at`, `expires_at` (nullable).
- **`clicks`**: `short_code` (FK), `clicked_at`, `referrer` (host-bucketed, or `"direct"`),
  `user_agent` (raw string, kept for future re-parsing if the parsing logic improves), `browser`,
  `os` (both parsed from `user_agent` at write time).

## Key decisions and why

| Decision | Rationale |
|---|---|
| SQLite (`better-sqlite3`) over Postgres/MySQL | Zero external services to run for a reviewer; synchronous API removes a whole class of async-ordering bugs (see the brownfield scenario for the one place this mattered); durable across restarts unlike a pure in-memory store |
| Short codes are atomic `INSERT` + catch-`UNIQUE`, not check-then-insert | See [`docs/scenarios/02-brownfield.md`](docs/scenarios/02-brownfield.md) — the original two-step version was safe within one Node process but not across multiple instances sharing the DB file |
| In-memory cache + in-memory rate limiter, not Redis | Right-sized for a single-process prototype; both are called out explicitly as the first two things to change if this service is ever horizontally scaled, rather than silently assumed to already support it |
| No ORM | Two tables, all access through a thin repository layer already — an ORM would add a dependency and an abstraction without removing meaningful complexity at this scale |
| Soft delete (`is_active`) instead of hard delete | Redirect/analytics history for a link stays queryable after deletion (useful for "why did this stop working" debugging); a hard-delete endpoint would be a one-line addition if actually needed |
| Zod validation with explicit scheme/self-referential-URL guards | Blocks `javascript:`/`data:` scheme abuse and redirect loops back to the service itself at the input boundary, not deep in business logic |

## Execution approach: how AI was used
Built directly with Claude Code as the implementer, one file/module at a time, with the engineer
reviewing each generated change before moving to the next rather than accepting a large batch of
generated code unreviewed. Each of the three required scenarios (greenfield build, brownfield fix,
ambiguous requirement) was planned as an explicit task list before implementation started, verified
against `npm run verify` and, where relevant, a manual smoke test against a running server before
being considered done, and documented with real examples of AI output that was accepted, edited,
or rejected — see [`docs/ai-traceability.md`](docs/ai-traceability.md) for the complete, itemized
log. Git history mirrors the three scenarios as three commits, in order, so the progression is
reviewable directly (`git log --oneline`).

## Known limitations (see scenario docs for full detail and rationale)
- Single-process only: redirect cache and rate limiter don't share state across instances.
- No authentication/authorization on any endpoint.
- Referrer/UA data is client-reported and best-effort (spoofable, sometimes absent).
- Geographic click origin was explicitly scoped out (see the ambiguous scenario), not silently
  omitted.
