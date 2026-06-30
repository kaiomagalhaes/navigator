# Navigator

A Next.js + Postgres application that acts as a data source and AI-processing hub for
meeting data. It syncs meetings from [Fathom](https://fathom.video) daily, storing the
transcript, participants, summary, and action items for downstream AI analysis.

The daily sync pulls every meeting accessible to your Fathom account from the last day
and keeps the ones where **`kaio@codelitt.com` or `kaio@carboncrei.com`** is either the
recorder or a calendar invitee.

## Stack

- Next.js 16 (App Router) + React 19
- Postgres 16 (via Docker Compose, local)
- Prisma 7 (with the `@prisma/adapter-pg` driver adapter)
- Fathom MCP server (`https://api.fathom.ai/mcp`), OAuth-authenticated, with the
  meetings/transcripts parsed from the MCP's text responses.

### Fidelity note

The Fathom MCP is OAuth-only and returns LLM-formatted text (not JSON), so the sync
requires a one-time browser login (`npm run fathom:auth`) and parses the text into the
schema. As a result: recorders/invitees come as **names** (emails only sometimes), there
are no scheduled/recording timestamps or `is_external` flags, and transcripts are
segmented by speaker-turn rather than sentence.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy the example:

   ```bash
   cp .env.example .env   # then edit .env
   ```

   | Variable             | Description                                              |
   | -------------------- | -------------------------------------------------------- |
   | `DATABASE_URL`       | Postgres connection (defaults to the Docker DB on 5433). |
   | `FATHOM_MCP_URL`     | Fathom MCP URL. Default already correct.                 |
   | `CRON_SECRET`        | Shared secret guarding `/api/cron/sync`.                 |
   | `SYNC_LOOKBACK_HOURS`| How far back each sync looks (default `26`).             |

   **Authorize the Fathom MCP once:**

   ```bash
   npm run fathom:auth   # opens a browser, caches tokens in .fathom-auth.json
   ```

   Re-run this if the cached token ever expires (the MCP doesn't issue refresh
   tokens, so a periodic re-auth may be needed).

3. **Start Postgres**

   ```bash
   npm run db:up        # docker compose up -d
   ```

4. **Apply the schema**

   ```bash
   npm run db:migrate   # prisma migrate dev
   ```

## Running

```bash
npm run fathom:auth    # one-time: authorize the Fathom MCP (MCP source only)
npm run dev            # app at http://localhost:3000 (dashboard of synced meetings)
npm run sync           # run the Fathom sync once, now
npm run db:studio      # browse the data in Prisma Studio
```

## Daily sync

The sync logic lives in `src/lib/sync/sync-meetings.ts` and is invoked two ways:

- **CLI** — `npm run sync` (used locally; wire to an OS cron / launchd entry to run daily).
  Example crontab entry (06:00 daily):

  ```cron
  0 6 * * * cd /path/to/navigator && /usr/local/bin/npm run sync >> /tmp/navigator-sync.log 2>&1
  ```

- **HTTP** — `POST` or `GET` `/api/cron/sync`, guarded by `CRON_SECRET`:

  ```bash
  curl -X POST http://localhost:3000/api/cron/sync \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

  When deployed to Vercel, `vercel.ts` registers a daily cron that hits this route
  (Vercel automatically sends `Authorization: Bearer $CRON_SECRET`).

## Data model

`prisma/schema.prisma` defines `Meeting` (keyed on Fathom `recordingId`) with related
`Participant`, `TranscriptSegment`, and `ActionItem` rows, plus a `SyncRun` audit log.
Syncs are idempotent: meetings are upserted and their child rows replaced in a transaction,
so re-running never duplicates data. `Meeting.aiProcessedAt` is reserved for the future AI
analysis layer (topics, action-item extraction, etc.).
