CREATE TABLE governed_work_links_v2 (
    link_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    visit_sequence INTEGER NOT NULL CHECK (visit_sequence > 0),
    attempt_id TEXT,
    operation_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pull_request', 'openspec_artifact')),
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (attempt_id) REFERENCES agent_attempts(attempt_id),
    FOREIGN KEY (operation_id) REFERENCES provider_operations(operation_id),
    UNIQUE (run_id, visit_sequence, kind, label)
);

INSERT INTO governed_work_links_v2 (
    link_id, run_id, visit_sequence, attempt_id, operation_id,
    kind, label, url, created_at
)
SELECT
    link.link_id,
    link.run_id,
    link.visit_sequence,
    operation.attempt_id,
    link.operation_id,
    link.kind,
    link.label,
    link.url,
    link.created_at
FROM governed_work_links link
JOIN provider_operations operation
  ON operation.operation_id = link.operation_id;

DROP INDEX governed_work_links_run_visit;
DROP TABLE governed_work_links;
ALTER TABLE governed_work_links_v2 RENAME TO governed_work_links;

CREATE INDEX governed_work_links_run_visit
ON governed_work_links (run_id, visit_sequence, created_at);

CREATE INDEX governed_work_links_operation
ON governed_work_links (operation_id, kind);

CREATE INDEX governed_work_links_attempt
ON governed_work_links (attempt_id, visit_sequence);

-- Planning publication records already contain the canonical pull-request URL,
-- immutable head SHA, exact manifest, and confirmed provider operation. Only
-- rows whose operation maps to one recorded attempt visit are eligible.
INSERT INTO governed_work_links (
    link_id, run_id, visit_sequence, attempt_id, operation_id,
    kind, label, url, created_at
)
SELECT
    'governed:' || operation.operation_id || ':pull-request',
    work_product.run_id,
    attempt.visit_sequence,
    attempt.attempt_id,
    operation.operation_id,
    'pull_request',
    'PR #' || work_product.pull_request_number,
    work_product.pull_request_url,
    operation.completed_at
FROM run_work_products work_product
JOIN provider_operations operation
  ON operation.operation_id = work_product.latest_publication_operation_id
 AND operation.run_id = work_product.run_id
JOIN agent_attempts attempt
  ON attempt.attempt_id = operation.attempt_id
 AND attempt.run_id = operation.run_id
WHERE operation.capability = 'github'
  AND operation.action = 'publish_planning_work_product'
  AND operation.state IN ('succeeded', 'reconciled', 'duplicate')
  AND operation.completed_at IS NOT NULL
  AND attempt.visit_sequence IS NOT NULL
  AND work_product.pull_request_number IS NOT NULL
  AND work_product.pull_request_url =
      'https://github.com/' || work_product.repository || '/pull/' || work_product.pull_request_number
ON CONFLICT (run_id, visit_sequence, kind, label) DO UPDATE SET
    attempt_id = excluded.attempt_id,
    operation_id = excluded.operation_id,
    url = excluded.url,
    created_at = excluded.created_at;

INSERT INTO governed_work_links (
    link_id, run_id, visit_sequence, attempt_id, operation_id,
    kind, label, url, created_at
)
SELECT
    'governed:' || operation.operation_id || ':artifact:' || printf('%04d', manifest_file.key),
    work_product.run_id,
    attempt.visit_sequence,
    attempt.attempt_id,
    operation.operation_id,
    'openspec_artifact',
    json_extract(manifest_file.value, '$.path'),
    'https://github.com/' || work_product.repository || '/blob/' || work_product.head_sha ||
      '/' || json_extract(manifest_file.value, '$.path'),
    operation.completed_at
FROM run_work_products work_product
JOIN provider_operations operation
  ON operation.operation_id = work_product.latest_publication_operation_id
 AND operation.run_id = work_product.run_id
JOIN agent_attempts attempt
  ON attempt.attempt_id = operation.attempt_id
 AND attempt.run_id = operation.run_id
JOIN json_each(work_product.planning_manifest_json) manifest_file
WHERE operation.capability = 'github'
  AND operation.action = 'publish_planning_work_product'
  AND operation.state IN ('succeeded', 'reconciled', 'duplicate')
  AND operation.completed_at IS NOT NULL
  AND attempt.visit_sequence IS NOT NULL
  AND json_valid(work_product.planning_manifest_json)
  AND json_type(manifest_file.value, '$.path') = 'text'
  AND length(work_product.head_sha) = 40
  AND work_product.head_sha NOT GLOB '*[^0-9a-f]*'
  AND json_extract(manifest_file.value, '$.path') LIKE
      'openspec/changes/' || work_product.change_id || '/%'
  AND instr(json_extract(manifest_file.value, '$.path'), '..') = 0
  AND instr(json_extract(manifest_file.value, '$.path'), '//') = 0
ON CONFLICT (run_id, visit_sequence, kind, label) DO UPDATE SET
    attempt_id = excluded.attempt_id,
    operation_id = excluded.operation_id,
    url = excluded.url,
    created_at = excluded.created_at;
