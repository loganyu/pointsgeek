-- Convert currency column from enum to text
ALTER TABLE "points_programs"
  ALTER COLUMN "currency" SET DATA TYPE text
  USING "currency"::text;

-- Drop the now-unused enum type
DROP TYPE IF EXISTS "currency";
