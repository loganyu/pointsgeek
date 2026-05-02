ALTER TABLE "balance_snapshots" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "scrape_events" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sync_reports" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."provider";--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('aa', 'amex', 'bilt', 'chase', 'capitalone', 'citi', 'delta', 'marriott', 'qatar', 'united');--> statement-breakpoint
ALTER TABLE "balance_snapshots" ALTER COLUMN "provider" SET DATA TYPE "public"."provider" USING "provider"::"public"."provider";--> statement-breakpoint
ALTER TABLE "scrape_events" ALTER COLUMN "provider" SET DATA TYPE "public"."provider" USING "provider"::"public"."provider";--> statement-breakpoint
ALTER TABLE "sync_reports" ALTER COLUMN "provider" SET DATA TYPE "public"."provider" USING "provider"::"public"."provider";