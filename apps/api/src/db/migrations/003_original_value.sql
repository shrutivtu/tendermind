-- Migration 003: Add original_value column to notices
-- estimated_value will now always be EUR (converted)
-- original_value stores the raw amount in the notice's native currency
-- currency stores the ISO 4217 code e.g. PLN, CZK, SEK, EUR

ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS original_value REAL;

-- Update currency for existing notices based on buyer country
-- (previously everything was hardcoded to EUR which was wrong)
UPDATE notices SET currency = CASE
  WHEN country = 'POL' THEN 'PLN'
  WHEN country = 'CZE' THEN 'CZK'
  WHEN country = 'SWE' THEN 'SEK'
  WHEN country = 'ROU' THEN 'RON'
  WHEN country = 'HUN' THEN 'HUF'
  WHEN country = 'DNK' THEN 'DKK'
  WHEN country = 'BGR' THEN 'BGN'
  ELSE 'EUR'
END
WHERE estimated_value IS NOT NULL;

-- Copy current estimated_value into original_value (it was stored unconverted)
UPDATE notices SET original_value = estimated_value
WHERE estimated_value IS NOT NULL;

-- NOTE: After running this, execute the fix-currencies script to
-- recalculate estimated_value in EUR using current ECB rates.
-- workers/ingestion: npx tsx --env-file=../../.env src/fix-currencies.ts
