-- SAC-182 run 2 was admitted with the bundled v44 digest while the stored v44
-- row still held an older digest. The new v45 bundle has the same definition
-- content as that admitted v44 bundle except its version number. Record this
-- exact repair after the failed replacement executor and aborted lease are
-- proven; do not change either historical v44 definition.
CREATE TABLE workflow_definition_repairs (
  repair_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  from_version INTEGER NOT NULL,
  from_digest TEXT NOT NULL,
  to_version INTEGER NOT NULL,
  to_digest TEXT NOT NULL,
  source_error_id TEXT NOT NULL REFERENCES workflow_errors(error_id),
  aborted_lease_id TEXT NOT NULL REFERENCES test_lease_aborts(lease_id),
  previous_recovery_id TEXT NOT NULL REFERENCES workflow_runtime_recoveries(recovery_id),
  source_workflow_instance_id TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK(provider_status='errored'),
  repaired_at TEXT NOT NULL
);

INSERT INTO workflow_definition_repairs
  (repair_id,run_id,from_version,from_digest,to_version,to_digest,
   source_error_id,aborted_lease_id,previous_recovery_id,
   source_workflow_instance_id,provider_status,repaired_at)
SELECT 'sac-182-run-2-v44-to-v45',r.run_id,44,r.definition_digest,
  45,next.digest,err.error_id,abort.lease_id,recovery.recovery_id,
  r.workflow_instance_id,'errored',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM orchestration_runs r
JOIN workflow_definitions old ON old.definition_id=r.definition_id
  AND old.version=44
JOIN workflow_definitions next ON next.definition_id=r.definition_id
  AND next.version=45
JOIN workflow_errors err ON err.run_id=r.run_id
  AND err.visit_sequence=r.current_visit_sequence
JOIN workflow_runtime_recoveries recovery ON recovery.run_id=r.run_id
  AND recovery.target_workflow_instance_id=r.workflow_instance_id
JOIN test_leases lease ON lease.run_id=r.run_id AND lease.state='closed'
JOIN test_lease_aborts abort ON abort.lease_id=lease.lease_id
JOIN test_lease_abort_guards guard ON guard.lease_id=lease.lease_id
WHERE r.run_id='workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:e75aad25-c32f-4c23-8184-b4b38388a631:run:2'
  AND r.status='active' AND r.current_node='shared_test_demo'
  AND r.current_visit_sequence=1495
  AND r.workflow_instance_id='wf-v1-hzxdwlfru4ickby2ucd6mq2bpphfzvinnakxyrtaidnvtu4bul5q'
  AND r.definition_id='implementation' AND r.definition_version=44
  AND r.definition_digest='08ee27af6612bcc9ba306ad2538e79df26f9567a22cee51580e31fc7e56fb554'
  AND old.digest='5a6cf0b2ab3ff753bb6b305715816efda654b8a38175b5e5d1c90ce8cb3395ef'
  AND next.digest='2f8c54a46752411c92257af6ddea468e6481b745f2b68750218a5ba367488072'
  AND err.error_id='597a5ddc-74a2-4808-b0cd-a6e0c460838a'
  AND err.message='stored workflow definition digest mismatch'
  AND recovery.state='established' AND recovery.from_visit_sequence=1494
  AND recovery.to_visit_sequence=1495
  AND abort.run_id=r.run_id AND abort.closed_at IS NOT NULL
  AND abort.receipt_json IS NOT NULL AND guard.ready=1
  AND NOT EXISTS (SELECT 1 FROM agent_attempts attempt WHERE attempt.run_id=r.run_id
    AND attempt.state IN ('pending','starting','running','collecting'))
  AND NOT EXISTS (SELECT 1 FROM test_leases held WHERE held.run_id=r.run_id
    AND held.state<>'closed');

UPDATE orchestration_runs SET definition_version=45,
  definition_digest='2f8c54a46752411c92257af6ddea468e6481b745f2b68750218a5ba367488072',
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE run_id='workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:e75aad25-c32f-4c23-8184-b4b38388a631:run:2'
  AND definition_version=44
  AND definition_digest='08ee27af6612bcc9ba306ad2538e79df26f9567a22cee51580e31fc7e56fb554'
  AND EXISTS (SELECT 1 FROM workflow_definition_repairs repair
    WHERE repair.repair_id='sac-182-run-2-v44-to-v45'
      AND repair.run_id=orchestration_runs.run_id);
