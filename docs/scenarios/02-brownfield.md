# Scenario 2 — Brownfield: Reliability Hardening on the Existing Service

## The ask
Two reliability gaps were flagged as known limitations at the end of the greenfield build (see
[`01-greenfield.md`](01-greenfield.md), "Risks, trade-offs, and known limitations"):
1. `UrlsRepository.create()` uses a check-then-insert pattern for short-code uniqueness.
2. The create and redirect endpoints have no abuse protection.

This scenario is the brownfield pass that closes both gaps on the existing codebase.

## Codebase reasoning
Before writing any fix, the actual impact needed pinning down precisely — "there's a race
condition" is not itself an engineering conclusion.

**Is the check-then-insert pattern actually racy, given the real architecture?**
`better-sqlite3` is a fully synchronous API, and Node runs JavaScript single-threaded with
run-to-completion semantics: once an Express request handler starts executing synchronous code
with no `await` in it, no other request's handler can interleave mid-function. Tracing the call
path (`urls.controller.ts` → `urls.service.ts` → `urls.repository.ts`) confirmed there is no
`await` anywhere between the `SELECT` and the `INSERT` — so **two concurrent HTTP requests to
this one Node process cannot actually interleave at that gap.** Claiming otherwise and "fixing"
it would have been fixing a bug that didn't exist for the reason claimed — a bad look under "no
half-finished implementations" and worse under "defensibility of decisions."

The real exposure is different and easy to miss: **the pattern is only safe *because of* a
same-process assumption that is not documented or enforced anywhere.** The moment this service
runs as more than one OS process against the same SQLite file — a second instance behind a load
balancer, or `node --cluster` for multi-core use, both completely ordinary reliability upgrades —
two separate processes genuinely can interleave at the OS/filesystem level between their `SELECT`
and `INSERT`. That's the actual bug: a latent landmine on the horizontal-scaling path, not a bug
in the code as currently deployed.

**Proof, not assertion.** True multi-process interleaving can't be reproduced deterministically
inside one synchronous Node process, so the two low-level SQL statements were driven directly, in
the exact order genuine interleaving would produce (two `SELECT`s before either `INSERT`) — this
is the same execution order the OS scheduler would produce across two processes, just triggered
by hand instead of by timing luck. Output, captured before any fix was applied:

```
Caller A SELECT result: code is free -> true
Caller B SELECT result: code is free -> true
(Both callers now believe they can safely claim this code.)

Caller A INSERT:
  succeeded.

Caller B INSERT (this is the OLD repository code path - no try/catch around it):
  THREW an unhandled low-level DB error:
   name: SqliteError
   code: SQLITE_CONSTRAINT_UNIQUE
   message: UNIQUE constraint failed: urls.short_code
```

Caller B's request would surface as a raw 500 to the client, even though a perfectly good short
code was available — a request-level failure caused entirely by a deployment-topology change,
not by anything the caller did wrong.

**Impacted surface**: `UrlsRepository.create()` only. `UrlsService.create()`'s retry loop and
`ConflictError`/`ShortCodeTakenError` handling were already written correctly against the
*intended* contract (any collision → typed error) — the bug was entirely that the repository
could throw something other than that typed error under the interleaved case. No other module
needed to change.

## Task decomposition
1. Empirically verify whether the race is real under the actual concurrency model, before writing
   a fix for it — depends on nothing (research task)
2. Fix: make `create()` atomic — attempt the `INSERT` directly, catch
   `SQLITE_CONSTRAINT_UNIQUE`, translate to the existing `ShortCodeTakenError` — depends on (1)
3. Regression tests: duplicate-insert rejection, no partial row left behind, service-level retry
   transparently recovers from a collision, exhausted-retries path returns a clean 503 — depends
   on (2)
4. Add per-IP rate limiting to `POST /api/urls` and `GET /:shortCode` — independent of (1)–(3),
   the second reliability gap from the greenfield risk list
5. Fix a **second, real bug found while wiring in (4)**: `express-rate-limit` instances were
   originally module-level singletons, so their hit counters persisted across every `createApp()`
   call in the same process — invisible in production (one instance per process), but it meant
   test cases in the same file silently inherited each other's exhausted rate-limit counts.
   Refactored to factory functions so every `createApp()` call gets fresh limiter state — depends
   on (4)
6. Integration tests proving both limiters trip at their configured thresholds and are
   independent of each other — depends on (5)
7. Manual smoke test against a running server (21 sequential creates, expect the 21st to 429) —
   depends on (6)

## AI-assisted execution
Full entries in [`docs/ai-traceability.md`](../ai-traceability.md#scenario-2--brownfield).
Highlights:

- **Rejected an initial framing**: the first instinct was to write a `Promise.all` of concurrent
  `fetch` calls against a running server as "the" concurrency test. Rejected before implementing
  it — with a synchronous DB driver and single-threaded Node, that test would almost never
  actually interleave at the vulnerable gap; it would just create N different random short codes
  successfully and prove nothing. Replaced with the direct-statement-ordering technique described
  above, which is deterministic instead of relying on timing luck.
- **Generated and accepted**: the atomic `INSERT`-then-catch repository fix and its accompanying
  `isUniqueConstraintError` helper matched the intended design on the first pass.
- **Found by testing, not by inspection**: the rate-limiter singleton test-isolation bug (item 5
  above) was only discovered because the second rate-limit test failed with an unexpected 429 on
  what should have been its first, unremarkable request. Root-caused to shared middleware state
  rather than patched around (e.g. by resetting only in tests) — the factory-function fix is
  strictly better production design too, not just a test workaround.

## Validation
- `npm run verify`: **40/40 tests passing** (6 new tests added this scenario: 2 for atomic
  collision handling, 2 for service-level retry behavior, 2 for rate limiting).
- Manual smoke test against a running server: 20 sequential `POST /api/urls` succeed, the 21st
  returns `429` with `{"error":"RATE_LIMITED"}` — matches the configured `RATE_LIMIT_CREATE_MAX`.
- Re-ran the interleaving demonstration script's logic as a permanent regression test
  (`tests/integration/concurrency.test.ts`) rather than leaving it as a one-off — it now proves
  the *fixed* behavior (typed error, no leaked partial row) rather than the bug.

## Risks, trade-offs, and remaining limitations
- **Rate limiter store is still in-memory and per-process** — same documented limitation as the
  redirect cache. A horizontally scaled deployment gets a per-instance limit, not a global one.
  Flagged in `middleware/rateLimiter.ts` directly; a Redis-backed store (e.g.
  `rate-limit-redis`) is the natural upgrade when this service actually scales beyond one process.
- **The multi-process short-code race was demonstrated by simulation, not by an actual
  multi-process test harness.** Spawning real OS processes against a shared SQLite file was
  considered but judged lower-value than the deterministic statement-ordering proof: it would add
  test flakiness (timing-dependent) without adding confidence, since SQLite's per-statement
  atomicity guarantee is exactly what the direct-order test already exercises. Noted here so the
  choice is visible, not silently made.
- **This fix does not add multi-process/horizontal-scaling *support*** (e.g. a shared cache, a
  shared rate-limit store) — it only removes one specific landmine on that path. Scaling this
  service to multiple instances would still require addressing the cache and rate-limiter
  limitations above first.
