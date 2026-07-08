ALTER TYPE "public"."program_type" ADD VALUE 'reward_program';--> statement-breakpoint
ALTER TYPE "public"."provider" ADD VALUE 'rove' BEFORE 'united';--> statement-breakpoint
UPDATE "points_programs" SET "program_type" = 'reward_program' WHERE "program_key" = 'bilt_rewards';
