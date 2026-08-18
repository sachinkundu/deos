ALTER TABLE orchestration_runs
ADD COLUMN current_visit_sequence INTEGER NOT NULL DEFAULT 1
CHECK (current_visit_sequence > 0);

ALTER TABLE orchestration_runs
ADD COLUMN last_transition_id TEXT;

ALTER TABLE workflow_transitions_v2
ADD COLUMN from_visit_sequence INTEGER NOT NULL DEFAULT 1
CHECK (from_visit_sequence > 0);

ALTER TABLE workflow_transitions_v2
ADD COLUMN to_visit_sequence INTEGER NOT NULL DEFAULT 2
CHECK (to_visit_sequence > 0);

UPDATE workflow_transitions_v2 AS transition_row
SET from_visit_sequence = 1 + (
        SELECT COUNT(*)
        FROM workflow_transitions_v2 AS prior
        WHERE prior.run_id = transition_row.run_id
          AND (
            prior.occurred_at < transition_row.occurred_at
            OR (
              prior.occurred_at = transition_row.occurred_at
              AND prior.transition_id < transition_row.transition_id
            )
          )
    ),
    to_visit_sequence = 2 + (
        SELECT COUNT(*)
        FROM workflow_transitions_v2 AS prior
        WHERE prior.run_id = transition_row.run_id
          AND (
            prior.occurred_at < transition_row.occurred_at
            OR (
              prior.occurred_at = transition_row.occurred_at
              AND prior.transition_id < transition_row.transition_id
            )
          )
    );

UPDATE orchestration_runs
SET current_visit_sequence = COALESCE(
        (
            SELECT MAX(transition_row.to_visit_sequence)
            FROM workflow_transitions_v2 AS transition_row
            WHERE transition_row.run_id = orchestration_runs.run_id
        ),
        1
    ),
    last_transition_id = (
        SELECT transition_row.transition_id
        FROM workflow_transitions_v2 AS transition_row
        WHERE transition_row.run_id = orchestration_runs.run_id
        ORDER BY transition_row.to_visit_sequence DESC
        LIMIT 1
    );

CREATE UNIQUE INDEX workflow_transitions_v2_run_from_visit
ON workflow_transitions_v2 (run_id, from_visit_sequence);
