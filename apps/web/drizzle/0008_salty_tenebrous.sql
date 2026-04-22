CREATE TYPE "public"."sync_report_status" AS ENUM('new', 'triaged', 'fixed', 'dismissed');--> statement-breakpoint
CREATE TABLE "sync_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" "provider" NOT NULL,
	"scraper_id" text,
	"url" text,
	"error_code" text,
	"error_message" text,
	"html_fragment" text NOT NULL,
	"user_agent" text,
	"extension_version" text,
	"status" "sync_report_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "sync_reports" ADD CONSTRAINT "sync_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;