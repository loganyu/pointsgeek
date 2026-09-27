ALTER TYPE "public"."program_type" ADD VALUE IF NOT EXISTS 'reward_program';--> statement-breakpoint
ALTER TYPE "public"."provider" ADD VALUE IF NOT EXISTS 'rove' BEFORE 'united';
