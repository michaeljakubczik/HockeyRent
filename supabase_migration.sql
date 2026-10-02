-- ==============================================================================
-- WIESEL HOCKEYRENT: KORRIGIERTE SQL-MIGRATION
-- 1. Bestehende Daten historisch exakt initialisieren (added_at / returned_at)
-- 2. Statischen UNIQUE-Constraint durch partiellen UNIQUE-Index ersetzen
-- 3. Bestehende Doppelverleih-Triggerfunktion hockey_prevent_double_active_rental() anpassen
-- ==============================================================================
-- HINWEIS:
-- - Keine Tabellen werden gelöscht oder umbenannt.
-- - Bestehende Daten bleiben zu 100 % erhalten und konsistent.
-- - Tabellennamen: hockey_equipment_items, hockey_rentals, hockey_rental_items
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SCHRITT 1: Spalten ohne vorzeitigen Default hinzufügen
-- ------------------------------------------------------------------------------
-- WICHTIG: Kein DEFAULT CURRENT_DATE beim Erstellen der Spalte, damit bestehende 
-- Datensätze nicht fälschlicherweise das heutige Datum erhalten.
ALTER TABLE public.hockey_rental_items 
ADD COLUMN IF NOT EXISTS added_at DATE,
ADD COLUMN IF NOT EXISTS returned_at DATE,
ADD COLUMN IF NOT EXISTS exchange_note TEXT;


-- ------------------------------------------------------------------------------
-- SCHRITT 2: Bestehende Zuordnungen präzise aus hockey_rentals initialisieren
-- ------------------------------------------------------------------------------
-- Für ALLE bisherigen Zuordnungen gilt:
-- 1) added_at = hockey_rentals.rented_at
-- 2) Wenn rental abgeschlossen: returned_at = hockey_rentals.returned_at
-- 3) Wenn rental noch aktiv:    returned_at = NULL
UPDATE public.hockey_rental_items ri
SET 
  added_at = COALESCE(r.rented_at::date, CURRENT_DATE),
  returned_at = r.returned_at::date
FROM public.hockey_rentals r
WHERE ri.rental_id = r.id;


-- ------------------------------------------------------------------------------
-- SCHRITT 3: Default für zukünftige Datensätze aktivieren
-- ------------------------------------------------------------------------------
-- Zukünftig neu eingefügte Teile erhalten standardmäßig das Tagesdatum als added_at,
-- sofern das Backend keinen abweichenden Wert übergibt.
ALTER TABLE public.hockey_rental_items 
ALTER COLUMN added_at SET DEFAULT CURRENT_DATE;


-- ------------------------------------------------------------------------------
-- SCHRITT 4: Bisherigen statischen UNIQUE-Constraint entfernen
-- ------------------------------------------------------------------------------
-- Der bisherige Constraint UNIQUE (rental_id, item_id) verhindert, dass ein Teil 
-- nach Rückgabe demselben laufenden Rental später erneut zugeordnet werden kann.
-- Wir entfernen diesen Constraint gezielt (unter allen üblichen Namen abgesichert).
ALTER TABLE public.hockey_rental_items 
DROP CONSTRAINT IF EXISTS hockey_rental_items_unique;

ALTER TABLE public.hockey_rental_items 
DROP CONSTRAINT IF EXISTS hockey_rental_items_rental_id_item_id_key;

DROP INDEX IF EXISTS public.hockey_rental_items_unique;
DROP INDEX IF EXISTS public.hockey_rental_items_rental_id_item_id_idx;
DROP INDEX IF EXISTS public.idx_hockey_rental_items_unique;


-- ------------------------------------------------------------------------------
-- SCHRITT 5: Partielle UNIQUE-Indizes für aktive Zuordnungen erstellen
-- ------------------------------------------------------------------------------
-- 5a) Im selben Rental darf dasselbe Item niemals zwei AKTIVE Zuordnungen haben.
-- Historische Zuordnungen (returned_at IS NOT NULL) sind beliebig oft erlaubt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hockey_rental_items_active_rental_item
ON public.hockey_rental_items (rental_id, item_id)
WHERE returned_at IS NULL;

-- 5b) Datenbankweiter Schutz: Ein Item darf niemals in zwei AKTIVEN Verleihzuordnungen sein.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hockey_rental_items_active_item_global
ON public.hockey_rental_items (item_id)
WHERE returned_at IS NULL;


-- ------------------------------------------------------------------------------
-- SCHRITT 6: Triggerfunktion public.hockey_prevent_double_active_rental() anpassen
-- ------------------------------------------------------------------------------
-- Ein Eintrag gilt nur dann als aktiv verliehen, wenn:
--   hockey_rental_items.returned_at IS NULL
--   UND hockey_rentals.returned_at IS NULL
-- Wurde ein Teil einzeln zurückgegeben (returned_at IS NOT NULL), ist es wieder frei!
CREATE OR REPLACE FUNCTION public.hockey_prevent_double_active_rental()
RETURNS TRIGGER AS $$
DECLARE
  conflict_rental_id INTEGER;
BEGIN
  -- 1. Wenn dieser konkrete Item-Eintrag bereits als zurückgegeben markiert ist,
  --    kann er keinen aktiven Doppelverleih auslösen.
  IF NEW.returned_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Wenn der Verleihvorgang selbst bereits beendet ist, kein Konflikt
  IF EXISTS (
    SELECT 1 FROM public.hockey_rentals
    WHERE id = NEW.rental_id AND returned_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- 3. Prüfen, ob für dasselbe Equipmentteil bereits eine andere AKTIVE Zuordnung existiert.
  --    Aktiv = hockey_rental_items.returned_at IS NULL UND hockey_rentals.returned_at IS NULL.
  SELECT ri.rental_id INTO conflict_rental_id
  FROM public.hockey_rental_items ri
  JOIN public.hockey_rentals r ON r.id = ri.rental_id
  WHERE ri.item_id = NEW.item_id
    AND ri.returned_at IS NULL
    AND r.returned_at IS NULL
    AND (TG_OP = 'INSERT' OR ri.id IS DISTINCT FROM NEW.id)
  LIMIT 1;

  IF conflict_rental_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ausrüstungsteil (ID %) ist bereits im aktiven Verleihvorgang #% verliehen.', 
      NEW.item_id, conflict_rental_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------------------------
-- SCHRITT 7: Trigger auf hockey_rental_items aktualisieren
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_hockey_prevent_double_active_rental ON public.hockey_rental_items;
DROP TRIGGER IF EXISTS hockey_prevent_double_active_rental_trigger ON public.hockey_rental_items;

CREATE TRIGGER trg_hockey_prevent_double_active_rental
BEFORE INSERT OR UPDATE OF item_id, rental_id, returned_at
ON public.hockey_rental_items
FOR EACH ROW
EXECUTE FUNCTION public.hockey_prevent_double_active_rental();


-- ------------------------------------------------------------------------------
-- SCHRITT 8: Dokumentationskommentare
-- ------------------------------------------------------------------------------
COMMENT ON COLUMN public.hockey_rental_items.added_at IS 'Datum, an dem das Teil zum Verleih hinzugefügt wurde';
COMMENT ON COLUMN public.hockey_rental_items.returned_at IS 'Datum der Rückgabe dieses Teils (NULL = noch aktiv im Verleih)';
COMMENT ON COLUMN public.hockey_rental_items.exchange_note IS 'Notiz zu Austausch- oder Teilrückgabevorgängen (z.B. Ersatz für E-003)';
