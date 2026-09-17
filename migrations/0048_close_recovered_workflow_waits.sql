-- A stage retry consumes the wait it leaves. Recover legacy waits only when a
-- durable operator retry proves departure from that exact node and visit.
UPDATE workflow_waits AS wait
SET status = 'consumed',
    consumed_at = (
      SELECT transition.occurred_at
      FROM workflow_transitions_v2 AS transition
      JOIN agent_stage_retries AS retry ON retry.transition_id = transition.transition_id
      WHERE transition.run_id = wait.run_id AND transition.from_node = wait.node_id
        AND transition.from_visit_sequence = wait.visit_sequence
        AND transition.cause_type = 'operator_retry'
      ORDER BY transition.to_visit_sequence LIMIT 1
    )
WHERE wait.status = 'awaiting' AND EXISTS (
  SELECT 1 FROM workflow_transitions_v2 AS transition
  JOIN agent_stage_retries AS retry ON retry.transition_id = transition.transition_id
  WHERE transition.run_id = wait.run_id AND transition.from_node = wait.node_id
    AND transition.from_visit_sequence = wait.visit_sequence
    AND transition.cause_type = 'operator_retry'
);
