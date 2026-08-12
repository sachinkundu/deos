CREATE UNIQUE INDEX IF NOT EXISTS workflow_transitions_identity
ON workflow_transitions (run_id, previous_state, next_state, cause);
