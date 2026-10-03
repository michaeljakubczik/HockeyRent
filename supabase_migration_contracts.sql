-- ==============================================================================
-- WIESEL HOCKEYRENT: SQL-MIGRATION FÜR DIGITALEN AUSLEIHVERTRAG (PHASE 1)
-- ==============================================================================
-- Tabelle für Vertragsdaten zur Einverständniserklärung der Ausleihe
-- Förderverein der Wiesel Arpke e.V., Am Hainhop 12, 31275 Lehrte
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.hockey_rental_contracts (
    id BIGSERIAL PRIMARY KEY,
    rental_id INTEGER NOT NULL REFERENCES public.hockey_rentals(id) ON DELETE CASCADE,
    
    -- Entleiher Stammdaten
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    child_name TEXT NOT NULL,
    
    -- Anschrift
    street TEXT NOT NULL,
    house_number TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    city TEXT NOT NULL,
    
    -- Kontaktdaten
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    
    -- Zahlungsdaten (SEPA-Lastschrift für 60 € Gebühr + 50 € Kaution)
    iban TEXT NOT NULL,
    
    -- Finanzielle Konditionen
    deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    fee_amount NUMERIC(10, 2) NOT NULL DEFAULT 60.00,
    
    -- Unveränderlicher Ausrüstungs-Snapshot zum Vertragszeitpunkt (JSONB)
    equipment_snapshot JSONB DEFAULT '[]'::jsonb,
    
    -- Vertragsstatus
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'ready', 'signed'
    
    -- Vorbereitung für Phase 2 (Unterschrift, PDF, Mail)
    signed_at TIMESTAMPTZ,
    signer_name TEXT,
    signature_data TEXT,
    pdf_url TEXT,
    email_sent_at TIMESTAMPTZ,
    
    -- Zeitstempel
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Eindeutigkeit: Genau ein Vertrag pro Ausleihe (hockey_rentals.id)
    CONSTRAINT hockey_rental_contracts_rental_id_key UNIQUE (rental_id)
);

-- Index für schnelle Abfragen über die Rental-ID
CREATE INDEX IF NOT EXISTS idx_hockey_rental_contracts_rental_id 
ON public.hockey_rental_contracts(rental_id);

-- Row Level Security (RLS) aktivieren zum Schutz personenbezogener Daten
ALTER TABLE public.hockey_rental_contracts ENABLE ROW LEVEL SECURITY;

-- Zugriff ausschließlich über den Backend Service-Role Schlüssel
CREATE POLICY "Service role full access on hockey_rental_contracts" 
ON public.hockey_rental_contracts 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Kommentar
COMMENT ON TABLE public.hockey_rental_contracts IS 'Vertragsdaten und Einverständniserklärungen für Hockey-Ausrüstungsverleih (Förderverein der Wiesel Arpke e.V.)';
