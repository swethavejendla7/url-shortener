# Scenario 1 — Greenfield: Core URL Shortener

## The ask
> "Build a URL shortener service from scratch with core APIs, analytics, and reliability
> features."

## Requirement understanding
The raw ask is high-level and leaves several things unstated. Before writing code, it was
normalized into concrete decisions (each recorded here so they're reviewable, not just assumed):

| Ambiguity in the ask | Decision made | Rationale |
|---|---|---|
| "core APIs" — which operations? | Create, redirect, get metadata, get analytics, delete | Matches the standard CRUD+redirect surface every URL shortener needs; nothing speculative added |
| "analytics" — how deep? | Click count + last-clicked timestamp per link | Minimal but real; richer breakdowns (referrer/browser) are deliberately deferred to the ambiguous scenario, where the *need* for them is the actual ask |
| "reliability features" — which ones? | Input validation, soft delete, link expiry, redirect caching, structured error responses | Rate limiting and concurrency-safety were identified but deliberately deferred — see "Known limitation carried forward" below |
| Storage technology | SQLite (file-based) + in-memory cache | Agreed with reviewer up front: zero external services to run, still durable across restarts, adequate for a prototype's scale |
| Short-code format | Random base62, 7 characters | ~3.5 trillion codes; long enough to make guessing/enumeration impractical, short enough to be usable |

## Task decomposition
1. Project scaffold (package.json, TypeScript config, ESLint, folder layout) — no dependencies
2. DB layer: migration runner + `001_init.sql` (urls, clicks tables) — depends on (1)
3. Short-code generator (`shortCode.ts`) + alias validation — depends on (1)
4. `urls` module: repository → service → controller → routes (create/get/delete) — depends on (2), (3)
5. Redirect route + click recording — depends on (4)
6. Analytics endpoint (click count, last-clicked) — depends on (2)
7. In-memory TTL/LRU cache in front of the redirect read path — depends on (4)
8. Error-handling middleware, structured logging (pino), health check — depends on (4)
9. Unit tests (short-code generator, cache, schema validation) — depends on (3), (7)
10. Integration tests (supertest against a fresh in-memory DB per test) — depends on (4)–(8)
11. Manual end-to-end smoke test against a running server — depends on (10)

## AI-assisted execution
Built directly with Claude as the implementer, working file-by-file with the engineer reviewing
each output before moving on. Representative examples of the discipline applied (full log in
[`docs/ai-traceability.md`](../ai-traceability.md)):

- **Generated as-is**: repository/service/controller layering for the `urls` module, zod schema,
  error-class hierarchy. Straightforward, matched the intended design, no edits needed.
- **Edited after generation**: `pino-http`'s default export doesn't type-check cleanly under
  `NodeNext` module resolution — switched to its named `pinoHttp` export instead of accepting a
  `// @ts-ignore`.
- **Rejected and redesigned**: the first cut of the integration-test harness set
  `process.env.DB_PATH` at the top of a test file before importing the app. That looks correct
  but is wrong — ES module `import` statements are hoisted above ordinary statements within a
  file, so the app's config module read the *old* `DB_PATH` before the override ran. The result
  was tests silently writing to a real file (`data/shortener.sqlite`) instead of an isolated
  in-memory DB — they still passed (random short codes meant collisions were unlikely), which is
  exactly what makes this class of bug dangerous. Caught by inspecting the working directory
  after a test run and noticing a database file that shouldn't have existed. Fixed by moving the
  env setup into a Vitest `setupFiles` entry, which runs before a test file's own imports are
  evaluated.

## Validation
- `npm run verify` (typecheck + lint + test): **34/34 tests passing**, zero lint errors.
- Manual smoke test against a running server: create → 201 with a valid short code; redirect →
  302 to the right target; analytics → click count incremented; unknown code → 404; invalid
  scheme (`javascript:...`) → 400 with a clear validation message.
- Confirmed test isolation is real (see the rejected-approach note above): after a full test run,
  no `data/` directory is created on disk — every test hits a fresh in-memory database.

## Risks, trade-offs, and known limitations carried forward
- **Known concurrency bug, deliberately not fixed here**: `UrlsRepository.create()` checks
  short-code availability with a `SELECT` and then does a separate `INSERT`. That gap is a
  check-then-act race — findable and fixable, but doing so is the brownfield scenario's subject,
  not this one's. Flagging it here rather than silently shipping it is itself part of the
  "identify risks/failure scenarios" requirement.
- **No rate limiting yet**: the create and redirect endpoints are open to abuse at this stage.
  Deferred intentionally to the brownfield scenario so that "add reliability control to an
  existing service" has a real, non-contrived task to demonstrate.
- **Cache is single-instance**: the in-memory redirect cache doesn't share state across multiple
  server instances or survive a restart. Acceptable for a single-process prototype; a horizontally
  scaled deployment would need a shared cache (Redis) instead.
- **No auth/authorization**: any caller can create, inspect, or delete any link. Out of scope for
  this assignment's stated core requirements, but called out explicitly rather than left implicit.
