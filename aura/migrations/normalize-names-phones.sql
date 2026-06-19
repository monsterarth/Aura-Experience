-- Normalize guest fullName to UPPERCASE and phone to digits-only
UPDATE guests
SET
  "fullName" = UPPER(TRIM("fullName")),
  phone = REGEXP_REPLACE(phone, '[^0-9]', '', 'g'),
  "updatedAt" = NOW()
WHERE
  "fullName" IS NOT NULL
  AND (
    "fullName" <> UPPER(TRIM("fullName"))
    OR phone ~ '[^0-9]'
  );

-- Normalize contact name to UPPERCASE
UPDATE contacts
SET
  name = UPPER(TRIM(name)),
  "updatedAt" = NOW()
WHERE
  name IS NOT NULL
  AND name <> UPPER(TRIM(name));
