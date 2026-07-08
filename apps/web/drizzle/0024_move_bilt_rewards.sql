UPDATE "points_programs"
SET "program_type" = 'reward_program'
WHERE "program_key" = 'bilt_rewards'
  AND "program_type" <> 'reward_program';
