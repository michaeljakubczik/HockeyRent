# Wiesel Hockey Verleih

React/Vite frontend, Express API and Supabase database/storage.

## Local development

Requires Node.js 22 or newer.

1. `npm ci`
2. Copy `.env.example` to `.env` and fill in server-side credentials.
3. Apply the versioned migration in `supabase/migrations` to the existing HockeyRent database. It extends the existing schema; it does not create the original application tables.
4. `npm run dev` starts API on 127.0.0.1:3001 and Vite on port 3000 with API proxy.
5. `npm run check` runs TypeScript, isolated PostgreSQL integration tests and the production build.

The tests use PGlite and synthetic data; they never connect to Production. npm is the canonical package manager and package-lock.json the sole dependency lockfile.

## Database and deployment

Apply `supabase/migrations/20261006075151_integrity_and_contracts.sql` before deploying the updated API. RPCs use SECURITY INVOKER and are executable only by service_role. Transactions serialize inventory and contract writes with a transaction-scoped advisory lock. Rate limiting is stored in the database across API instances. Contract PDFs are private and their hashes are checked on download.

The migration fixes logically determined interrupted returns and derives equipment status from active positions. It preserves individual return dates and refuses to edit or delete signed contracts. Do not rerun old unversioned SQL initialization scripts on current data. Legacy PDFs without frozen rental dates are not silently regenerated from live dates.

Admin authentication uses a signed session with 12-hour expiry, stored per browser tab; the raw password is not persisted. Existing users must sign in again after this update. Set ADMIN_PASSWORD, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel; SESSION_SECRET is optional and falls back to ADMIN_PASSWORD.

## Contract email (prepared, disabled by default)

Apply `supabase/migrations/20261006103140_contract_mail_outbox.sql` before deploying this feature. New signatures create two persistent delivery jobs in the signature transaction: the contract email and `foerderverein-wieselarpke@mail.de`. Identical addresses are deduplicated. Existing signed contracts are not automatically queued or mailed; an explicit admin send can queue them later.

Keep `CONTRACT_MAIL_ENABLED=false` until sender setup and an authorized test are complete. Missing/invalid configuration also disables sending. Choose `CONTRACT_MAIL_PROVIDER=resend` with `RESEND_API_KEY`, or `smtp` with `SMTP_HOST`, `SMTP_PORT` (465/587), `SMTP_USER`, `SMTP_PASSWORD`. Set `CONTRACT_MAIL_FROM` to the verified sender's plain email address. Credentials are server-only and never stored in contracts or returned to the browser.

The admin's signed-contract preview shows each recipient's status. Authenticated GET/POST `/api/rentals/:id/contract/email` reads status/sends pending or definitively failed copies. Signed-contract data stays immutable. Each recipient is claimed atomically; accepted messages are never automatically sent again. Emails attach the original private archived PDF and verify its stored SHA-256; missing/unverifiable legacy archives require correction, not regeneration for email.

"sent" means accepted by the sending provider, not confirmed delivery to the inbox. A timeout or interrupted attempt is treated as uncertain (stale claims after three minutes), blocked from automatic retry, and must be checked at the provider. SMTP message IDs alone do not guarantee deduplication. Resend uses a stable idempotency key as additional protection, not as the sole guard. Provider failures never remove the archived PDF or undo the signature. No background worker or scheduled retry is enabled; manual retry handles pending/failed jobs.

## Validation

Integration tests cover return rollback, item membership, duplicate/missing IDs, repeated return repair, contract review conflicts, single-use links, immutable signed contracts, protected amounts, PNG signature validation and PDF generation. Tests use an embedded PostgreSQL instance, not multiple physical sessions; production locking is implemented with pg_advisory_xact_lock.

### Photos and history size

New equipment photos are resized to at most 800 px on the longest side and compressed as WebP (JPEG fallback), with an upload size cap. Original existing photos are retained. Inventory reads return the lifetime rental count and current borrower without transferring past rental relationships.

The UI uses `/api/history?page=1`: all open rentals plus 25 completed rentals per page, a global paid revenue total and global counters. Changing history pages reuses already loaded equipment photos. The legacy array response without `page` remains available for older clients. Server-only read functions and indexes are in `20261006130528_history_summary.sql`.
