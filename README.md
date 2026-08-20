<<<<<<< HEAD
# URL Shortener

A URL shortener service with core CRUD/redirect APIs, click analytics (including a
referrer/browser/OS breakdown), and reliability features (input validation, redirect caching,
rate limiting, atomic short-code allocation).

Built as a working prototype for an AI-assisted engineering exercise. This README covers
everything needed to **run it and verify it works** — for the engineering process behind it
(requirement decomposition, AI-assisted execution log, risk/trade-off analysis), see:

- [`ENGINEERING_SUMMARY.md`](ENGINEERING_SUMMARY.md) — the full process writeup: plan, artifacts,
  risks/trade-offs, assumptions, limitations
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system design, components, control flow, key decisions
- [`docs/scenarios/`](docs/scenarios/) — the three worked scenarios (greenfield, brownfield,
  ambiguous), each showing decomposition, execution, and validation
- [`docs/ai-traceability.md`](docs/ai-traceability.md) — an itemized log of AI-generated output
  that was accepted, edited, or rejected, with the reasoning for each
- `git log --oneline` — commit history mirrors the scenario progression, one commit per step

---

## Before you start: what you need

- **Node.js version 20 or newer.** Check what you have installed:
  ```bash
  node -v
  ```
  If that prints something like `v20.x.x` or higher, you're set — skip to **Step 1** below.
  If it prints `command not found` or a version below 20, see
  **[No Node.js / wrong version](#no-nodejs--wrong-version)** first.
- **A terminal.** On macOS: the **Terminal** app (in Applications → Utilities, or search with
  Spotlight/`⌘+Space`). On Windows: **PowerShell**, **Git Bash**, or WSL. On Linux: your usual
  terminal.
- That's it — no database server, no Docker, no external services to install. Everything
  (including the database) runs as plain files on your machine.

---

## Step 1 — Unzip and open a terminal there

Unzip `url-shortener-submission.zip` (or whatever the file was named) anywhere convenient. Then
open a terminal and move into that folder, e.g.:

```bash
cd ~/Downloads/project
```

(adjust the path to wherever you actually unzipped it — `ls` will show you `package.json`,
`README.md`, `src/`, etc. if you're in the right place)

## Step 2 — Run the setup script

**On macOS or Linux** (or Windows with Git Bash / WSL):

```bash
./setup.sh
```

> If you got this project as a zip (email, Drive, AirDrop) and see
> **`zsh: operation not permitted: ./setup.sh`**, that's macOS blocking a downloaded script from
> running directly — run `bash setup.sh` instead (see
> [Troubleshooting](#troubleshooting) for why and for another fix).

**On Windows PowerShell**, or if `./setup.sh` doesn't work for any reason, run the same three
steps by hand instead:

```bash
npm install
cp .env.example .env
npm run migrate
```

Either way, you should see output ending in something like:

```
Setup complete. Next steps:
  npm run dev      # start the server at http://localhost:3000
  npm run verify   # typecheck + lint + full test suite
```

This step downloads dependencies (may take 30–60 seconds), creates a local config file (`.env`),
and sets up the local database file. It's safe to run more than once if you're not sure it worked.

## Step 3 — Start the server

```bash
npm run dev
```

You should see output ending in a line containing `"msg":"url-shortener listening"`, for example:

```
{"level":30,...,"port":3000,"baseUrl":"http://localhost:3000","msg":"url-shortener listening"}
```

**Leave this terminal window open and running** — it's the server. Don't type anything else into
it; it will keep printing a log line for every request it receives, which is normal.

## Step 4 — Open it in a browser

Go to **http://localhost:3000** in any web browser. You should see a page titled "URL Shortener"
with a form to paste a long URL.

That's the whole setup: unzip → `./setup.sh` → `npm run dev` → open the browser.

---

## How to verify it actually works

Two ways to check — pick whichever you're more comfortable with. Both talk to the same running
server from Step 3.

### Option A — the web page (easiest, no typing commands)

With the server running (Step 3) and the page open (Step 4):

1. Paste a real URL into the **Long URL** box, e.g. `https://en.wikipedia.org/wiki/URL_shortening`
2. Click **Shorten**. A short link like `http://localhost:3000/aB3xY9z` appears, with **Copy
   link** and **View analytics** buttons.
3. Click the short link itself (it opens in a new tab) — it should take you to the real page you
   entered.
4. Below the form, the **Your links** table lists every link created, with a live click count.
   Click **Refresh** and you should see the count go up to `1` after visiting your link.
5. Click **Analytics** next to any row to see a click/referrer/browser breakdown; click **Delete**
   to soft-delete a link (its row will show "deleted" and stop redirecting).

If all five of those behave as described, the whole thing is working end to end.

### Option B — the terminal, using `curl`

Open a **second terminal window** (leave the one running the server alone — see Step 3). In the
new window, run these one at a time:

```bash
# 1. Create a short link
curl -s -X POST http://localhost:3000/api/urls \
  -H "Content-Type: application/json" \
  -d "{\"longUrl\":\"https://example.com\"}"
```
Expected output — a line of JSON containing a `shortCode`, e.g.:
```json
{"shortCode":"aB3xY9z","shortUrl":"http://localhost:3000/aB3xY9z","longUrl":"https://example.com","createdAt":"...","expiresAt":null,"isActive":true}
```
Copy the `shortCode` value you actually got back (yours will differ) for the next two commands.

```bash
# 2. Follow it — replace aB3xY9z with your real shortCode
curl -i http://localhost:3000/aB3xY9z
```
Expected output — starts with `HTTP/1.1 302 Found` and includes `Location: https://example.com`.

```bash
# 3. Check the click was tracked — replace aB3xY9z with your real shortCode
curl -s http://localhost:3000/api/urls/aB3xY9z/analytics
```
Expected output — JSON containing `"totalClicks":1`.

If all three match, the API is working correctly.

### Option C — the automated test suite

This doesn't need the server running at all — it's a separate, self-contained check:

```bash
npm run verify
```

This runs a TypeScript type check, a linter, and 54 automated tests. Expected output ends with:

```
Test Files  7 passed (7)
     Tests  54 passed (54)
```

No red text and no `failed` anywhere means everything passes. This is the same command run
before every commit in this project's history.

---

## Troubleshooting

<a id="no-nodejs--wrong-version"></a>
**`node: command not found`, or `node -v` shows a version below 20:**
Install Node.js 20+ any of these ways, then re-open your terminal and try Step 2 again:
- [Official installer](https://nodejs.org/) for your OS — simplest option
- `brew install node` (macOS, if you have [Homebrew](https://brew.sh/))
- [`nvm`](https://github.com/nvm-sh/nvm): `nvm install` (reads the `.nvmrc` file in this project
  automatically)

**`permission denied` when running `./setup.sh`:**
Run `chmod +x setup.sh` once, then try `./setup.sh` again. Or just skip it and run the three
manual commands from Step 2 instead.

**`zsh: operation not permitted: ./setup.sh`** (macOS, usually after receiving this project as a
zip via email/Drive/AirDrop): macOS marks downloaded files as "quarantined," and Gatekeeper blocks
directly *executing* a quarantined shell script (note this is a different error than the
`permission denied` case above). Fix with either of these:
```bash
bash setup.sh
```
or
```bash
xattr -dr com.apple.quarantine .
./setup.sh
```
Or skip the script entirely and run the three manual commands from Step 2 — they don't require
executing any downloaded file, so this error can't happen with that path.

**`npm install` seems to hang / sits there for a long time after the `npm warn deprecated` lines:**
This is normal, not stuck. Those deprecation warnings are just noise from old transitive
dependencies; the actual package download and native-module setup (`better-sqlite3`, `esbuild`)
happens after them and can take 1–3 minutes depending on your network — longer than the warnings
make it look. Only worry if it sits with zero output and zero CPU activity for 5+ minutes, or
prints an actual `npm error` in red.

**`Error: listen EADDRINUSE: address already in use :::3000`:**
This means a server is *already* running on port 3000 — most likely you already ran `npm run dev`
in another terminal window earlier and forgot. That's not a failure; find that window (or just go
straight to **Step 4** and open the browser, it's already working) instead of running `npm run dev`
again. If you genuinely need a second instance, change `PORT=3000` to another number in `.env`
first.

**Nothing happens when I visit `http://localhost:3000`, or the browser shows "can't connect":**
Check the terminal from Step 3 is still open and still shows the server running (not stopped, not
showing an error). If it crashed, scroll up in that terminal to see why, or just run `npm run dev`
again.

**I ran `npm run dev` in a *new* terminal window by mistake, on top of one already running:**
You'll see the `EADDRINUSE` error above — that's harmless, it just means you don't need a second
one. Close that new window, or press `Ctrl+C` in it, and use the original one.

**I want to start over with a completely empty database:**
Stop the server (`Ctrl+C` in its terminal), then delete the database file and restart:
```bash
rm -f data/shortener.sqlite*
npm run dev
```

---

## What you're actually looking at (project structure)

```
src/                  application code (Express API, business logic, database access)
tests/                54 automated tests (unit + integration)
public/index.html     the built-in web page (calls the same JSON API described below)
docs/scenarios/       the three worked scenarios: greenfield, brownfield, ambiguous
docs/ai-traceability.md   AI-generated/edited/rejected log with rationale
ARCHITECTURE.md       system design and key decisions
ENGINEERING_SUMMARY.md   the full process writeup — plan, risks, assumptions, limitations
setup.sh              one-command setup (see Step 2 above)
```

### Scripts reference
| Command | Does |
|---|---|
| `./setup.sh` | One-time (or re-run anytime) setup: install deps, create `.env`, run migrations |
| `npm run dev` | Start the server with auto-reload on file changes |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build (`dist/index.js`) |
| `npm run migrate` | Apply pending DB migrations without starting the server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over `src` and `tests` |
| `npm test` | Run the full test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run verify` | typecheck + lint + test — the quality gate used before every commit |

## API reference

All responses are JSON except the redirect itself. Errors follow `{ "error": CODE, "message": "..." }`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/urls` | Create a short URL. Body: `{ longUrl, customAlias?, expiresInDays? }` |
| `GET` | `/api/urls` | List all links ever created (newest first, up to 100), each with its total click count. Includes deleted links, marked `isActive: false` |
| `GET` | `/:shortCode` | Redirect to the target URL; records a click. Rate limited |
| `GET` | `/api/urls/:shortCode` | Get link metadata (no redirect) |
| `GET` | `/api/urls/:shortCode/analytics` | Click count, last-clicked time, and a referrer/browser/OS breakdown |
| `DELETE` | `/api/urls/:shortCode` | Soft-delete a link |
| `GET` | `/health` | Liveness check |

### More API examples

```bash
# Custom alias + expiry
curl -s -X POST http://localhost:3000/api/urls \
  -H 'Content-Type: application/json' \
  -d '{"longUrl":"https://example.com","customAlias":"my-link","expiresInDays":7}'

# Delete a link
curl -X DELETE http://localhost:3000/api/urls/my-link

# Health check
curl http://localhost:3000/health
```

## Testing approach
54 tests (unit + integration via `supertest` against a fresh in-memory SQLite DB per test — see
[`tests/integration/testApp.ts`](tests/integration/testApp.ts) and
[`tests/setupEnv.ts`](tests/setupEnv.ts)). Covers: input validation, redirect/expiry/soft-delete
behavior, atomic short-code collision handling, rate-limit thresholds, and the click-analytics
breakdown. Full breakdown of what's covered — and what's deliberately not — is in
[`ENGINEERING_SUMMARY.md`](ENGINEERING_SUMMARY.md#testing-approach-limitations-and-trade-offs).

## Limitations at a glance
Single-process only: the redirect cache and rate limiter are in-memory and don't share state
across multiple instances of the service. No authentication — any caller can create, inspect, or
delete any link. Both are documented in detail, with rationale, in the scenario docs and
`ENGINEERING_SUMMARY.md` rather than silently left out.
=======
# url-shortener
>>>>>>> 7a7f4a24f4ed9f78b728b63041e8442a0374dcc0
