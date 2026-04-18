-- Add delta_skymiles to the provider enum
ALTER TYPE "public"."provider" ADD VALUE IF NOT EXISTS 'delta_skymiles';
