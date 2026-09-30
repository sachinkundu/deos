-- Keep the first failed demo attempts and authorize one exact, audited retry.
CREATE TABLE test_demo_repair_retries (
  request_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL UNIQUE REFERENCES test_leases(lease_id),
  run_id TEXT NOT NULL,
  old_attempt_id TEXT NOT NULL UNIQUE,
  new_attempt_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  restored_description_sha256 TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  committed_at TEXT
);

-- SAC-182's older candidate rejected the lease session. Its first marker
-- update reached Linear, but Linear reformatted a trailing list comment. The
-- exact original description was restored and read back through Linear MCP.
-- This row authorizes only that blocked attempt; it is not a passed test.
INSERT INTO test_demo_repair_retries
  (request_id,lease_id,run_id,old_attempt_id,new_attempt_id,reason,
   restored_description_sha256,requested_at)
SELECT 'sac182-auth-wrapper-v1',l.lease_id,l.run_id,l.attempt_id,
  '2a237817-b7a1-4081-a139-76a546ab604f',
  'candidate_access_rejected_and_marker_format_changed',
  '4f47ff527bc27708b6a01f561c14bb36f473372337a95e99ba92338089fd0827',
  '2026-09-29T07:23:00.000Z'
FROM test_leases l JOIN agent_attempts a ON a.attempt_id=l.attempt_id
JOIN test_environment e ON e.owner_lease_id=l.lease_id
JOIN test_expected_events x ON x.lease_id=l.lease_id
WHERE l.lease_id='21c57acf3c8489cb1cc1438437ad16cc8a835c5a080b5b510a46414bd4ba6b5c'
  AND l.run_id='workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:e75aad25-c32f-4c23-8184-b4b38388a631:run:2'
  AND l.attempt_id='c64950fe-e6c2-4fdf-81de-e841311fab45'
  AND l.state='active' AND e.state='active' AND e.owner_run_id=l.run_id
  AND a.state='blocked' AND a.cleanup_state='destroyed'
  AND x.expectation_id='sac182-provider-event-run2'
  AND x.state='live' AND x.claimed_delivery_id IS NULL
  AND x.before_sha256='4f47ff527bc27708b6a01f561c14bb36f473372337a95e99ba92338089fd0827'
  AND NOT EXISTS (SELECT 1 FROM test_provider_deliveries p WHERE p.lease_id=l.lease_id)
  AND NOT EXISTS (SELECT 1 FROM test_delivery_dispatch d WHERE d.lease_id=l.lease_id);

UPDATE test_expected_events SET state='disabled'
WHERE expectation_id='sac182-provider-event-run2' AND state='live'
  AND claimed_delivery_id IS NULL
  AND EXISTS (SELECT 1 FROM test_demo_repair_retries r
    WHERE r.request_id='sac182-auth-wrapper-v1'
      AND r.lease_id=test_expected_events.lease_id);

UPDATE test_operations SET state='done',
  receipt_json='{"reconciled":true,"providerUpdateObserved":true,"testRouteClaimed":false,"linearDescriptionRestored":true,"restoredDescriptionSha256":"4f47ff527bc27708b6a01f561c14bb36f473372337a95e99ba92338089fd0827"}',
  ended_at='2026-09-29T07:23:00.000Z'
WHERE work_id='test-marker:sac182-provider-event-run2:insert'
  AND state='running'
  AND EXISTS (SELECT 1 FROM test_demo_repair_retries r
    WHERE r.request_id='sac182-auth-wrapper-v1'
      AND r.lease_id=test_operations.lease_id);
