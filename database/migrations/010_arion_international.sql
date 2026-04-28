-- International data fields for Arion Horse Tracker ingestion.
--
-- Arion emails carry purse in native currency (GBP/EUR/QAR/USD/etc.), tag
-- horses with country of origin, and emit DNF codes (FF/PU/BD/DQ) that don't
-- fit a NOT NULL integer finish_position. Add additive columns so US data
-- keeps working unchanged and Euro data has somewhere to land.

ALTER TABLE horses ADD COLUMN country TEXT;

ALTER TABLE entries
    ADD COLUMN race_country TEXT,
    ADD COLUMN purse_currency TEXT;

ALTER TABLE results
    ADD COLUMN race_country TEXT,
    ADD COLUMN purse_currency TEXT,
    ADD COLUMN earnings_currency TEXT,
    ADD COLUMN finish_status TEXT;

-- Allow NULL finish_position for DNF codes (FF/PU/BD/UR/DQ/LFT/REF).
-- US Equibase data has never carried these, but Arion does for jump and
-- the occasional flat disqualification.
ALTER TABLE results ALTER COLUMN finish_position DROP NOT NULL;

COMMENT ON COLUMN horses.country IS
    '3-letter country of foaling (GB, IRE, FR, GER, USA, AUS, NZ, ...). NULL for legacy US-only rows.';
COMMENT ON COLUMN entries.race_country IS
    'Full country name of the racetrack as emitted by Arion (Great Britain, Ireland, France, Germany, USA, ...). NULL for legacy US rows.';
COMMENT ON COLUMN entries.purse_currency IS
    'ISO 4217 code for purse (GBP, EUR, USD, QAR, AUD, NZD, ...). NULL on legacy US rows implies USD.';
COMMENT ON COLUMN results.race_country IS
    'Full country name of the racetrack (mirrors entries.race_country).';
COMMENT ON COLUMN results.purse_currency IS
    'ISO 4217 purse currency (mirrors entries.purse_currency).';
COMMENT ON COLUMN results.earnings_currency IS
    'ISO 4217 earnings currency. Usually matches purse_currency but kept separate because Arion prints them independently.';
COMMENT ON COLUMN results.finish_status IS
    'DNF code when finish_position is NULL: FF (fell/failed to finish), PU (pulled up), BD (brought down), UR (unseated rider), DQ (disqualified), LFT (left at start), REF (refused). NULL for a numeric finish.';
