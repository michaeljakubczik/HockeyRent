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

## Validation

Integration tests cover return rollback, item membership, duplicate/missing IDs, repeated return repair, contract review conflicts, single-use links, immutable signed contracts, protected amounts, PNG signature validation and PDF generation. Tests use an embedded PostgreSQL instance, not multiple physical sessions; production locking is implemented with pg_advisory_xact_lock.
