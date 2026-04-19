ALTER TABLE "balance_snapshots" ALTER COLUMN "balance_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ALTER COLUMN "balance_type" SET DEFAULT 'total'::text;--> statement-breakpoint
DROP TYPE "public"."balance_type";--> statement-breakpoint
CREATE TYPE "public"."balance_type" AS ENUM('total', 'ytd_earned_on_card');--> statement-breakpoint
ALTER TABLE "balance_snapshots" ALTER COLUMN "balance_type" SET DEFAULT 'total'::"public"."balance_type";--> statement-breakpoint
ALTER TABLE "balance_snapshots" ALTER COLUMN "balance_type" SET DATA TYPE "public"."balance_type" USING "balance_type"::"public"."balance_type";