-- ==============================================================================
-- WIESEL HOCKEYRENT: SQL-MIGRATION FÜR GEPLANTES RÜCKGABEDATUM (due_date)
-- ==============================================================================
-- Erweitert hockey_rentals um das geplante Rückgabedatum (due_date).
-- Das tatsächliche Rückgabedatum verbleibt unverändert in returned_at.
-- ==============================================================================

ALTER TABLE public.hockey_rentals
ADD COLUMN IF NOT EXISTS due_date DATE;

COMMENT ON COLUMN public.hockey_rentals.due_date IS 'Geplantes Rückgabedatum des Bundles (grundsätzlich 6 Kalendermonate ab rented_at)';
