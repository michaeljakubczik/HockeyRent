-- ==============================================================================
-- WIESEL HOCKEYRENT: SQL-MIGRATION FÜR DIGITALEN AUSLEIHVERTRAG (PHASE 2)
-- ==============================================================================
-- Erweiterung für rechtsverbindliche digitale Unterschrift, unveränderlichen
-- Vertragstext-Snapshot und sichere private PDF-Archivierung in Supabase Storage.
-- Förderverein der Wiesel Arpke e.V., Am Hainhop 12, 31275 Lehrte
-- ==============================================================================

-- 1. ZUSÄTZLICHE FELDER IN DER TABELLE hockey_rental_contracts
-- Bereits in Phase 1 vorhanden:
-- id, rental_id, first_name, last_name, child_name, street, house_number,
-- postal_code, city, phone, email, iban, deposit_amount, fee_amount,
-- equipment_snapshot, status, signed_at, signer_name, signature_data, pdf_url

-- Neues Feld: Unveränderlicher Vertragstext-Snapshot (JSONB)
-- Speichert den vollständigen, zum Unterzeichnungszeitpunkt gültigen Vertragstext
ALTER TABLE public.hockey_rental_contracts
ADD COLUMN IF NOT EXISTS contract_snapshot JSONB DEFAULT NULL;

-- Neues Feld: Versionskennung des Vertragstemplates (z. B. '2026-10-v1')
ALTER TABLE public.hockey_rental_contracts
ADD COLUMN IF NOT EXISTS contract_version TEXT DEFAULT '2026-10-v1';

-- Neues Feld: Interner Pfad im privaten Storage-Bucket (z. B. 'contracts/42/contract_42.pdf')
ALTER TABLE public.hockey_rental_contracts
ADD COLUMN IF NOT EXISTS pdf_path TEXT DEFAULT NULL;

-- Kommentare zur Dokumentation
COMMENT ON COLUMN public.hockey_rental_contracts.contract_snapshot IS 'Eingefrorener vollständiger Vertragstext-Snapshot zum Zeitpunkt der rechtsverbindlichen Signatur.';
COMMENT ON COLUMN public.hockey_rental_contracts.contract_version IS 'Versionskennung der zugrundeliegenden Vertragsvorlage (z. B. 2026-10-v1).';
COMMENT ON COLUMN public.hockey_rental_contracts.pdf_path IS 'Interner Speicherpfad im privaten Supabase-Storage-Bucket hockey-contracts.';


-- ==============================================================================
-- 2. PRIVATER SUPABASE STORAGE-BUCKET: hockey-contracts
-- ==============================================================================
-- WICHTIG: Der Bucket ist streng privat (public = false).
-- Kein anonymer Zugriff; Zugriff erfolgt ausschließlich über das Backend.

-- Bucket anlegen falls noch nicht vorhanden
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'hockey-contracts',
    'hockey-contracts',
    false,                         -- Streng privat: KEINE öffentliche URL!
    10485760,                      -- Max. 10 MB pro PDF-Datei
    ARRAY['application/pdf']::text[] -- Ausschließlich PDF-Dateien zulässig
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf']::text[];

-- RLS-Policy: Service-Role hat vollen Lese- und Schreibzugriff auf den Bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
          AND tablename = 'objects' 
          AND policyname = 'Service role full access on hockey-contracts'
    ) THEN
        CREATE POLICY "Service role full access on hockey-contracts"
        ON storage.objects
        FOR ALL
        TO service_role
        USING (bucket_id = 'hockey-contracts')
        WITH CHECK (bucket_id = 'hockey-contracts');
    END IF;
END $$;
