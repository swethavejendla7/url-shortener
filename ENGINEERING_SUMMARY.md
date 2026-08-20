# Final Engineering Summary

## Plan and rationale
The brief asked for a URL shortener prototype built to demonstrate an AI-assisted engineering
*process*, not just a working service. The plan was to build the core service once
(greenfield), then deliberately carry forward two real, documented limitations from that build
into a second pass (brownfield: a concurrency assumption and missing abuse protection), then
resolve a genuinely underspecified product ask as a third pass (ambiguous: click-source
analytics). This was chosen over building three unrelated toy features because it lets each
scenario be a real continuation of the same codebase under real constraints, which is closer to
how brownfield/ambiguous work actually shows up in practice than three disconnected exercises
would be.

Stack (Node.js/TypeScript/Express/SQLite) was agreed with the reviewer up front — see the three
scenario documents for the task-by-task decomposition, execution, and validation within each
pass:
- [`docs/scenarios/01-greenfield.md`](docs/scenarios/01-greenfield.md) — core service build
- [`docs/scenarios/02-brownfield.md`](docs/scenarios/02-brownfield.md) — atomic short-code fix +
  rate limiting
- [`docs/scenarios/03-ambiguous.md`](docs/scenarios/03-ambiguous.md) — click-source breakdown

Git history mirrors this: three commits, one per scenario, in order (`git log --oneline`).

## Artifacts produced
- **Working service**: `src/` — Express API, SQLite persistence via two versioned migrations,
  in-memory redirect cache, per-route rate limiting, structured logging, zod input validation.
- **48 tests** (`tests/`) — unit tests for the short-code generator, cache, schema validation, and
  UA/referrer parsing; integration tests (via `supertest` against a fresh in-memory DB per test)
  for the full API surface, atomic collision handling, and rate-limit thresholds.
- **Documentation**: this file, [`README.md`](README.md) (setup/API reference),
  [`ARCHITECTURE.md`](ARCHITECTURE.md) (components/control flow/key decisions), three scenario
  docs, and [`docs/ai-traceability.md`](docs/ai-traceability.md) (itemized AI-generated /
  edited / rejected log with rationale for each entry).

## Risks, trade-offs, and validation (consolidated)
| Area | Risk/trade-off | Mitigation / why accepted | Validated by |
|---|---|---|---|
| Short-code allocation | Check-then-insert is safe in-process but racy across multiple service instances sharing one DB file | Made atomic: `INSERT` directly, catch `SQLITE_CONSTRAINT_UNIQUE` | Reproduced pre-fix via controlled statement-ordering (captured output in the brownfield doc); regression tests in `tests/integration/concurrency.test.ts` |
| Abuse on write/redirect endpoints | No rate limiting in the initial build | Per-IP `express-rate-limit` on both `POST /api/urls` and `GET /:shortCode` | `tests/integration/rateLimiter.test.ts`; manual smoke test (20 succeed, 21st → 429) |
| Redirect latency vs. durability | Async ("fire and forget") click logging would be faster but could silently drop a click on a crash | Chose synchronous click recording — `better-sqlite3` makes the cost sub-millisecond | Noted in `docs/ai-traceability.md` as a rejected-then-corrected AI suggestion |
| Horizontal scaling | Redirect cache and rate limiter are in-memory, per-process | Explicitly documented as the next thing to change (Redis-backed store) if this service scales beyond one instance, not silently assumed away | Called out in `ARCHITECTURE.md`, both scenario docs, and inline code comments at the exact spot the assumption lives |
| "Where clicks are coming from" scope | Four plausible interpretations (geo-IP, referrer, device, campaign attribution); building all of them would be scope creep on a one-line ask | Interpreted and scoped explicitly (referrer + device in scope; geo-IP and campaign attribution named and excluded with reasons) before writing code | `docs/scenarios/03-ambiguous.md`; integration test proving the resulting breakdown shape |
| Redirect-loop / injection surface | Open `longUrl` input could point to `javascript:`/`data:` schemes or back at the service itself | Zod validation restricts to `http`/`https` and blocks the service's own host | `tests/unit/urls.schema.test.ts`; manual smoke test confirming a `javascript:` payload is rejected with `400` |
| Redirect cache invalidation | `app.ts` gave `UrlsController` and `RedirectController` each their own default `UrlsService`, so each had its own `TtlCache`; a `DELETE` invalidated the wrong one, and a link redirected once then deleted kept 302-ing to its (deactivated) target for up to the 5-minute cache TTL | Found by manual smoke test (48 passing automated tests did not cover it — none redirected through a link before deleting it); fixed by constructing one `UrlsService` in `app.ts` and injecting it into both controllers | New regression test in `tests/integration/urls.api.test.ts` (warm cache → delete → redirect, asserts `410`); re-run against a live server post-fix. Full root-cause writeup in `docs/ai-traceability.md`, "Post-build review" |

## Assumptions
- Single-process deployment for this prototype (explicitly not production-scaled); anything
  requiring multi-instance support is named as a limitation, not assumed solved.
- Reviewers running this locally have Node.js 20+, or are willing to use a portable Node
  install as described in the README (this project's own dev environment had neither a system
  Node nor Homebrew/`nvm` available, and used exactly that approach).
- "Analytics" for the greenfield build means click count + last-clicked time; richer breakdowns
  were deliberately deferred to the ambiguous scenario rather than built speculatively upfront.
- No authentication was in scope for this exercise; every endpoint is open. Called out explicitly
  rather than left as a silent gap.

## Limitations
- `GET /api/urls` (list all links) is capped at 100 rows with no pagination — fine at prototype
  scale, would need an offset/cursor param before this could be relied on with a larger link count.
- No auth/authorization on any endpoint.
- In-memory cache and rate limiter are single-process only (see table above).
- User-agent parsing and referrer capture are both best-effort and client-reported — spoofable,
  sometimes absent, not suitable for anything that needs certainty rather than a directional
  breakdown.
- No geographic click-origin data (scoped out in the ambiguous scenario for cost/privacy reasons,
  not an oversight).
- `npm audit` originally reported 5 findings (3 moderate, 1 high, 1 critical), all inside the
  `vitest`/`vite`/`esbuild` dev-toolchain (devDependencies only) — each advisory requires a
  dev-server component (`vite dev`, `vitest --ui`) this project never runs, and none of that code
  ships in `dist/` or is reachable via `npm start`. Confirmed by inspecting each advisory
  individually (`npm audit --json`) rather than trusting the top-line severity count, which npm
  rolls up to the worst transitive finding. Resolved by upgrading `vitest` `^2.1.1` → `^4.1.11`:
  verified as a safe major-version bump for this project specifically (no config changes needed,
  `vitest.config.ts` unchanged, all 49 tests still pass) before applying it, rather than reflexively
  running `npm audit fix --force` — `npm audit` now reports 0 vulnerabilities.

## Testing approach, limitations, and trade-offs
- **Unit tests**: pure logic with no I/O — short-code generation/alias validation, TTL/LRU cache
  behavior (via Vitest fake timers), zod schema rules, UA parsing/referrer bucketing (assertions
  verified against actual library output, not assumed — see the ambiguous scenario doc for a case
  where a guessed assertion would have been wrong).
- **Integration tests**: full HTTP surface via `supertest` against a real Express app instance
  backed by a fresh **in-memory** SQLite database per test (`tests/setupEnv.ts` +
  `tests/integration/testApp.ts`). Deliberately not mocking the DB layer — the whole point of
  several of these tests (atomic collision handling, cascade of soft-delete → cache invalidation)
  is DB-level behavior a mock would hide.
- **Manual smoke tests**: run at the end of each scenario against an actual running server via
  `curl`, not just the automated suite — catches anything a test's assumptions might have missed
  (e.g. real HTTP header casing, actual redirect status codes).
- **What's not covered**: no load/performance testing (no throughput or latency claims are made
  anywhere in this documentation as a result); no real multi-process concurrency test (the
  brownfield scenario explains why a deterministic statement-ordering proof was chosen over a
  flaky, timing-dependent multi-process harness); no browser/E2E testing of `public/index.html`
  (added later as a convenience layer over the JSON API, for interactive manual testing — it was
  verified once via a real browser session, not covered by an automated test beyond confirming
  the server serves it and that it doesn't shadow a real short code — see the static-UI tests in
  `tests/integration/urls.api.test.ts`).
- **Quality gate**: `npm run verify` (typecheck + lint + full test run) was green before each of
  the three scenario commits — not just at the very end.
