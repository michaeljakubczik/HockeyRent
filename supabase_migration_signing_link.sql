-- ==============================================================================
-- WIESEL HOCKEYRENT: SQL-MIGRATION FÜR SICHEREN EXTERNEN VERTRAGSLINK
-- ==============================================================================
-- Ermöglicht Entleihern das mobile Prüfen, Ergänzen und rechtsverbindliche
-- digitale Signieren des Ausleihvertrags über einen individuellen Sicherheits-Link.
-- Förderverein der Wiesel Arpke e.V., Am Hainhop 12, 31275 Lehrte
-- ==============================================================================

-- 1. ZUSÄTZLICHE FELDER IN DER TABELLE hockey_rental_contracts
-- SHA-256-Hash des kryptografischen Zufallstokens (niemals Klartext in der DB speichern)
ALTER TABLE public.hockey_rental_contracts
ADD COLUMN IF NOT EXISTS signing_token_hash TEXT DEFAULT NULL;

-- Ablaufzeitpunkt des Signierlinks (standardmäßig 7 Tage nach Erzeugung)
ALTER TABLE public.hockey_rental_contracts
ADD COLUMN IF NOT EXISTS signing_token_expires_at TIMESTAMPTZ DEFAULT NULL;

-- 2. INDEX FÜR SCHNELLE & RESSOURCENSCHONENDE TOKEN-SUCHE
CREATE INDEX IF NOT EXISTS idx_hockey_rental_contracts_token_hash
ON public.hockey_rental_contracts (signing_token_hash);

-- 3. KOMMENTARE ZUR DOKUMENTATION
COMMENT ON COLUMN public.hockey_rental_contracts.signing_token_hash IS 'Kryptografischer SHA-256 Hash des Einmal-Tokens für das externe digitale Signieren des Vertragsentwurfs.';
COMMENT ON COLUMN public.hockey_rental_contracts.signing_token_expires_at IS 'Ablaufzeitpunkt der Gültigkeit des externen Signierlinks (standardmäßig 7 Tage nach Erzeugung).';
