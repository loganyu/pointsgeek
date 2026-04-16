-- Create new enums
CREATE TYPE "public"."program_type" AS ENUM('bank_rewards', 'airline', 'hotel');
CREATE TYPE "public"."currency" AS ENUM('points', 'miles');

-- Create points_programs table
CREATE TABLE "points_programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "program_type" "program_type" NOT NULL,
  "name" text NOT NULL,
  "currency" "currency" NOT NULL DEFAULT 'points',
  "issuer" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create cards table
CREATE TABLE "cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "points_programs"("id") ON DELETE CASCADE,
  "card_name" text NOT NULL,
  "last_four" text,
  "issuer" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Update balance_snapshots: drop account_label, add program_id and card_id
ALTER TABLE "balance_snapshots" DROP COLUMN IF EXISTS "account_label";
ALTER TABLE "balance_snapshots" ADD COLUMN "program_id" uuid REFERENCES "points_programs"("id") ON DELETE SET NULL;
ALTER TABLE "balance_snapshots" ADD COLUMN "card_id" uuid REFERENCES "cards"("id") ON DELETE SET NULL;

-- Clean up unused enum from previous migration attempt
DROP TYPE IF EXISTS "account_type";
