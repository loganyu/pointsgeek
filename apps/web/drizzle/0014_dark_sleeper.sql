-- Collapse multi-account-per-program rows down to one row per
-- (user_id, program_key). For each duplicate set, the surviving row
-- is the one with the most specific `external_account_id` (loyalty:*
-- preferred), tie-broken by most recent activity. FK references on
-- `cards` and `balance_snapshots` are migrated to the winner before
-- the loser rows are deleted.

ALTER TABLE "points_programs" DROP CONSTRAINT "uniq_user_program_external_account";--> statement-breakpoint

CREATE TEMP TABLE _losers AS
WITH ranked AS (
  SELECT
    id,
    user_id,
    program_key,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, program_key
      ORDER BY
        CASE
          WHEN external_account_id LIKE 'loyalty:%' THEN 0
          WHEN external_account_id <> 'default' THEN 1
          ELSE 2
        END,
        last_sync_at DESC NULLS LAST,
        created_at DESC
    ) AS rn
  FROM "points_programs"
),
winners AS (
  SELECT id, user_id, program_key FROM ranked WHERE rn = 1
)
SELECT r.id AS loser_id, w.id AS winner_id
FROM ranked r
JOIN winners w ON w.user_id = r.user_id AND w.program_key = r.program_key
WHERE r.rn > 1;--> statement-breakpoint

UPDATE "cards"
SET program_id = l.winner_id
FROM _losers l
WHERE "cards".program_id = l.loser_id;--> statement-breakpoint

UPDATE "balance_snapshots"
SET program_id = l.winner_id
FROM _losers l
WHERE "balance_snapshots".program_id = l.loser_id;--> statement-breakpoint

DELETE FROM "points_programs"
WHERE id IN (SELECT loser_id FROM _losers);--> statement-breakpoint

DROP TABLE _losers;--> statement-breakpoint

ALTER TABLE "points_programs" ADD CONSTRAINT "uniq_user_program" UNIQUE("user_id","program_key");
