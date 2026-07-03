# Plan: Daily sync worker (past-30 + Fathom, next-7 pull) + Heroku deploy

> Status: **planned, not yet implemented.** Captured for follow-up.

## Context

We want a once-a-day job that keeps the data warm without anyone opening the app:

1. **Import the last 30 days of meetings and link Fathom** to them — pulling **one day at a time with a 20s pause between days** so we stay under Fathom's 60 req/min limit.
2. **Pull calendar meetings for the next 7 days** (upcoming, no Fathom — those recordings don't exist yet).

It runs via **Heroku Scheduler** (one-off dyno) daily at **05:00 UTC = 02:00 America/São_Paulo** (Brazil has no DST, so this is stable). The worker's actions must also be runnable **through npm** (locally and as the Scheduler command). App deploys on **Heroku**.

### Decisions already made
- **Scheduling**: Heroku Scheduler (one-off dyno), not an always-on worker dyno.
- **Timezone**: 02:00 America/São_Paulo → schedule at **05:00 UTC**.
- **npm-runnable**: the worker's actions are exposed as npm scripts.

### Existing building blocks to reuse
- `importCalendarRange(account, from, to)` (`src/lib/import-events.ts`) — imports a range's **past** meetings (`fetchMeetingEvents` skips future) into `calendar_events`/`persons` **and Fathom-links each** (`linkImportedEvents`, already sequential). Exactly the past-30 behavior.
- `syncDay(dayStart, dayEnd, dateKey)` (`src/lib/day-sync.ts`) — pulls a day's meetings (incl. future via `fetchDayEvents`), reconciles, **no Fathom**. Exactly the upcoming-pull behavior.
- `parseDayParam` / `dayWindow` / `toDateParam` (`src/lib/format.ts`), `db.query.googleAccounts.findMany()` (`src/db`).

## Approach

### 1. Worker logic — `src/worker/daily-sync.ts` (new)

Starts with `import "dotenv/config";` (local `.env`; no-op on Heroku where config vars are already in `process.env`). Exports two actions and a CLI dispatcher:

- `backfillPastMeetings()` — for each of the **previous 30 days** (offsets −1 … −30, newest first): for every connected account `await importCalendarRange(account, dayStart, dayEnd)` (per-account try/catch so one failure doesn't sink the run), then `await sleep(20_000)` **between days** (skip the wait after the last). This is the Fathom-rate-limited loop.
- `pullUpcomingMeetings()` — for **today through +7** (offsets 0 … 7): `await syncDay(dayStart, dayEnd, toDateParam(dayStart))`. No Fathom, so no 20s wait (Google Calendar limits are generous); still one day at a time.
- `main()` — reads `process.argv[2]`: `"fathom"` → past only, `"upcoming"` → upcoming only, otherwise **both** (past first, then upcoming). Logs a start/finish line per day and a summary. **Ends with `process.exit(0)`** (and `exit(1)` on fatal error) so the one-off dyno terminates instead of hanging on the open pg pool.

Day windows use the existing local-midnight helpers so they line up with the rest of the app.

### 2. npm scripts (run the actions through npm) — `package.json`

`server-only` modules (`import-events.ts`, `day-sync.ts`, `google.ts`) throw when imported outside a React-server context, so the runner sets Node's `react-server` export condition; `tsx` runs the TS directly and resolves the `@/*` tsconfig paths.

```jsonc
"_worker": "node --conditions=react-server --import tsx src/worker/daily-sync.ts",
"worker": "npm run _worker",                     // full daily job (past + upcoming)
"worker:fathom": "npm run _worker -- fathom",    // last 30 days + Fathom only
"worker:upcoming": "npm run _worker -- upcoming" // next 7 days only
```

Add **`tsx`** to `dependencies` (not devDependencies — Heroku prunes dev deps, and the one-off worker dyno needs it at runtime).

> Verify locally that `tsx` resolves `@/*`. If it doesn't, fall back to bundling the worker with `esbuild --bundle --platform=node --conditions=react-server` during build and running the bundled JS.

### 3. Heroku runtime config

- **`Procfile`** (new):
  ```
  web: npm run start -- -p $PORT
  release: npm run db:migrate:deploy
  ```
  (Scheduler is configured in the dashboard, not the Procfile — see step 5. No long-running `worker:` dyno, per the chosen one-off approach.)
- **`package.json` `engines`**: pin Node (e.g. `"node": "22.x"`) so Heroku uses a Next 16-compatible runtime. Heroku auto-runs `npm run build` (`next build`) via the Node buildpack.
- **Postgres SSL** — `src/db/index.ts`: Heroku Postgres requires TLS. Add `ssl` to the `Pool` when not local:
  ```ts
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = globalForDb.pool ?? new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  ```
- **Migrations on deploy** — `src/db/migrate.ts` (new): programmatic `migrate()` from `drizzle-orm/node-postgres/migrator` over `./src/db/migrations` (uses `drizzle-orm`, a prod dep, so it works after dev-dep pruning — unlike `drizzle-kit`). Add `"db:migrate:deploy": "node --import tsx src/db/migrate.ts"`; the `release` phase runs it on every deploy. `db:generate` / `db:migrate` (drizzle-kit) stay for local dev.

### 4. Heroku provisioning (manual steps for the user)

`heroku create` → `heroku addons:create heroku-postgresql` → set config vars (`GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENC_KEY`, `AUTH_SECRET`, `FATHOM_API_KEY`, `OPENAI_API_KEY`, `TODOIST_*`, OAuth redirect + `AUTH_URL`/trustHost updated to the Heroku URL) → `git push heroku main`. Update Google OAuth authorized redirect URIs for the Heroku domain.

### 5. Scheduler

`heroku addons:create scheduler:standard`, then in the Scheduler dashboard add a **daily** job at **05:00 UTC** running `npm run worker` (= 02:00 America/São_Paulo).

## Notes / decisions

- **20s pause is only in the past/Fathom loop** (that's what hits Fathom); the upcoming pull is Google-only and runs day-by-day without the pause. Full run ≈ 30 × 20s ≈ 10 min plus per-day work — fine for a one-off dyno (no 30s router limit).
- **Idempotent**: `importCalendarRange` upserts + re-links; `syncDay` only writes on change. Safe to run daily and to re-run manually.
- **Today** is covered by the upcoming pull (offset 0, all-events) and gets Fathom-linked on the next day's run (offset −1) once recordings exist.
- Actions are cleanly separable so `npm run worker:fathom` / `worker:upcoming` can be run independently for manual backfills or debugging.

## Verification

1. `npm run worker:upcoming` locally → confirm the next-7-days sync runs day-by-day and exits; check `day_syncs` rows updated and upcoming events present.
2. `npm run worker:fathom` locally → confirm it processes one day at a time with ~20s gaps (watch log timestamps) and Fathom links appear on past meetings; confirm no Fathom 429s.
3. `npm run worker` → runs both, then the process **exits** (doesn't hang).
4. `npx tsc --noEmit` clean; `next build` succeeds locally.
5. Post-deploy: `heroku run npm run worker` (one-off dyno) completes; `heroku pg:psql` shows updated data; verify the Scheduler job is set to 05:00 UTC daily.
