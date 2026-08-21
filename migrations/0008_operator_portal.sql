CREATE TABLE linear_issue_index (
    issue_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    issue_key TEXT NOT NULL,
    title TEXT NOT NULL,
    linear_url TEXT NOT NULL,
    source_delivery_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    UNIQUE (project_id, issue_key)
);

CREATE INDEX linear_issue_index_project_key
ON linear_issue_index (project_id, issue_key);

ALTER TABLE agent_attempts
ADD COLUMN visit_sequence INTEGER CHECK (visit_sequence > 0);

ALTER TABLE workflow_waits
ADD COLUMN visit_sequence INTEGER CHECK (visit_sequence > 0);

CREATE TABLE governed_work_links (
    link_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    visit_sequence INTEGER NOT NULL CHECK (visit_sequence > 0),
    operation_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('pull_request')),
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (operation_id) REFERENCES provider_operations(operation_id),
    UNIQUE (run_id, visit_sequence, kind, url)
);

CREATE INDEX governed_work_links_run_visit
ON governed_work_links (run_id, visit_sequence, created_at);

-- A historical row is linked only when its timestamp falls within exactly one
-- durable visit to the same node. Ambiguous rows deliberately remain NULL.
WITH visit_windows AS (
    SELECT run.run_id, 1 AS visit_sequence, definition.value AS node_id,
           run.created_at AS entered_at,
           (SELECT transition.occurred_at
              FROM workflow_transitions_v2 transition
             WHERE transition.run_id = run.run_id
               AND transition.from_visit_sequence = 1) AS left_at
      FROM orchestration_runs run
      JOIN workflow_definitions snapshot
        ON snapshot.definition_id = run.definition_id
       AND snapshot.version = run.definition_version
      JOIN json_each(snapshot.canonical_json, '$.start') definition
    UNION ALL
    SELECT transition.run_id, transition.to_visit_sequence, transition.to_node,
           transition.occurred_at,
           (SELECT outgoing.occurred_at
              FROM workflow_transitions_v2 outgoing
             WHERE outgoing.run_id = transition.run_id
               AND outgoing.from_visit_sequence = transition.to_visit_sequence)
      FROM workflow_transitions_v2 transition
)
UPDATE agent_attempts AS attempt
   SET visit_sequence = (
       SELECT MIN(visit.visit_sequence)
         FROM visit_windows visit
        WHERE visit.run_id = attempt.run_id
          AND visit.node_id = attempt.node_id
          AND attempt.created_at >= visit.entered_at
          AND (visit.left_at IS NULL OR attempt.created_at <= visit.left_at)
       HAVING COUNT(*) = 1
   );

WITH visit_windows AS (
    SELECT run.run_id, 1 AS visit_sequence, definition.value AS node_id,
           run.created_at AS entered_at,
           (SELECT transition.occurred_at
              FROM workflow_transitions_v2 transition
             WHERE transition.run_id = run.run_id
               AND transition.from_visit_sequence = 1) AS left_at
      FROM orchestration_runs run
      JOIN workflow_definitions snapshot
        ON snapshot.definition_id = run.definition_id
       AND snapshot.version = run.definition_version
      JOIN json_each(snapshot.canonical_json, '$.start') definition
    UNION ALL
    SELECT transition.run_id, transition.to_visit_sequence, transition.to_node,
           transition.occurred_at,
           (SELECT outgoing.occurred_at
              FROM workflow_transitions_v2 outgoing
             WHERE outgoing.run_id = transition.run_id
               AND outgoing.from_visit_sequence = transition.to_visit_sequence)
      FROM workflow_transitions_v2 transition
)
UPDATE workflow_waits AS wait
   SET visit_sequence = (
       SELECT MIN(visit.visit_sequence)
         FROM visit_windows visit
        WHERE visit.run_id = wait.run_id
          AND visit.node_id = wait.node_id
          AND wait.created_at >= visit.entered_at
          AND (visit.left_at IS NULL OR wait.created_at <= visit.left_at)
       HAVING COUNT(*) = 1
   );

INSERT OR IGNORE INTO governed_work_links (
    link_id, run_id, visit_sequence, operation_id, kind, label, url, created_at
)
SELECT
    'governed:' || operation.operation_id,
    operation.run_id,
    attempt.visit_sequence,
    operation.operation_id,
    'pull_request',
    'Pull request #' || operation.provider_resource_id,
    'https://github.com/' || policy.trial_repository || '/pull/' || operation.provider_resource_id,
    operation.completed_at
FROM provider_operations operation
JOIN agent_attempts attempt ON attempt.attempt_id = operation.attempt_id
JOIN orchestration_runs run ON run.run_id = operation.run_id
JOIN project_workflow_policies policy ON policy.project_id = run.project_id
WHERE operation.capability = 'github'
  AND operation.action = 'publish_work_product'
  AND operation.state IN ('succeeded', 'reconciled', 'duplicate')
  AND operation.provider_resource_id GLOB '[1-9][0-9]*'
  AND operation.completed_at IS NOT NULL
  AND attempt.visit_sequence IS NOT NULL;
