CREATE TYPE "public"."sync_status" AS ENUM('ok', 'failed');--> statement-breakpoint
ALTER TABLE "points_programs" ADD COLUMN "last_sync_at" timestamp;--> statement-breakpoint
ALTER TABLE "points_programs" ADD COLUMN "last_sync_status" "sync_status";--> statement-breakpoint
ALTER TABLE "points_programs" ADD COLUMN "last_sync_error" text;