-- One durable owner for the shared site. A timeout changes the fence, never ownership.
CREATE TABLE test_environment (
  site_id INTEGER PRIMARY KEY CHECK(site_id=1),
  state TEXT NOT NULL CHECK(state IN ('free','preparing','active','quiescing','cleaning','blocked')),
  saved_phase TEXT,
  owner_run_id TEXT,
  owner_lease_id TEXT,
  fence INTEGER NOT NULL DEFAULT 0,
  heartbeat_due_at TEXT,
  cleanup_driver TEXT,
  hold_reason TEXT,
  last_lease_id TEXT,
  first_fault_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  CHECK((state='free' AND owner_run_id IS NULL AND owner_lease_id IS NULL) OR
        (state<>'free' AND owner_run_id IS NOT NULL AND owner_lease_id IS NOT NULL))
);
INSERT INTO test_environment(site_id,state,updated_at) VALUES(1,'free',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE staging_release_pointer (
  site_id INTEGER PRIMARY KEY CHECK(site_id=1),
  state TEXT NOT NULL CHECK(state IN ('uninitialized','stable','updating','blocked')),
  manifest_id TEXT,
  manifest_revision INTEGER,
  traffic_revision TEXT,
  work_id TEXT,
  owner TEXT,
  planned_manifest_id TEXT,
  heartbeat_due_at TEXT,
  first_fault_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
INSERT INTO staging_release_pointer(site_id,state,updated_at) VALUES(1,'uninitialized',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE staging_release_manifests (
  manifest_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL UNIQUE,
  traffic_revision TEXT NOT NULL,
  service_count INTEGER NOT NULL CHECK(service_count>0),
  digest_sha256 TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE staging_release_services (
  manifest_id TEXT NOT NULL REFERENCES staging_release_manifests(manifest_id),
  service_name TEXT NOT NULL,
  source_commit TEXT NOT NULL,
  deploy_version TEXT NOT NULL,
  build_input_sha256 TEXT NOT NULL,
  app_paths_json TEXT NOT NULL CHECK(json_valid(app_paths_json)),
  provider_paths_json TEXT NOT NULL CHECK(json_valid(provider_paths_json)),
  read_at TEXT NOT NULL,
  PRIMARY KEY(manifest_id,service_name)
);

CREATE TABLE test_lease_requests (
  queue_number INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL,
  node_visit INTEGER NOT NULL,
  attempt_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  candidate_commit TEXT NOT NULL,
  patch_sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('waiting','validating','granted','canceled','superseded')),
  validation_json TEXT CHECK(validation_json IS NULL OR json_valid(validation_json)),
  terminal_proof_json TEXT CHECK(terminal_proof_json IS NULL OR json_valid(terminal_proof_json)),
  validation_due_at TEXT,
  cancel_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id,node_visit,task_id,candidate_commit)
);
CREATE UNIQUE INDEX test_lease_one_waiting_visit ON test_lease_requests(run_id,node_visit)
  WHERE state IN ('waiting','validating');
CREATE INDEX test_lease_queue ON test_lease_requests(state,queue_number);

CREATE TABLE test_leases (
  lease_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES test_lease_requests(request_id),
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  task_title TEXT NOT NULL,
  team_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('preparing','active','quiescing','cleaning','blocked','closed')),
  fence INTEGER NOT NULL,
  base_manifest_id TEXT NOT NULL,
  base_traffic_revision TEXT NOT NULL,
  base_json TEXT NOT NULL CHECK(json_valid(base_json)),
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  pull_request_number INTEGER,
  candidate_commit TEXT NOT NULL,
  patch_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  closed_at TEXT,
  first_fault_id TEXT
);
CREATE INDEX test_leases_run ON test_leases(run_id,state);

CREATE TABLE test_lease_fence_epochs (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  transition_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(lease_id,fence)
);

CREATE TABLE test_task_decisions (
  run_id TEXT NOT NULL,
  candidate_commit TEXT NOT NULL,
  patch_sha256 TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  manifest_revision INTEGER NOT NULL,
  changed_paths_sha256 TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('test_required','test_not_required')),
  matched_paths_json TEXT NOT NULL CHECK(json_valid(matched_paths_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(run_id,candidate_commit,patch_sha256,manifest_revision)
);

CREATE TABLE test_access_identities (
  identity_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  resource_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  audience TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  principal_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  absent_at TEXT
);

CREATE TABLE test_app_sessions (
  session_sha256 TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  origin TEXT NOT NULL,
  cookie_class TEXT NOT NULL,
  access_identity_id TEXT NOT NULL REFERENCES test_access_identities(identity_id),
  principal_sha256 TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE test_resources (
  resource_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  create_fence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  plan_state TEXT NOT NULL CHECK(plan_state IN ('planned','creating','created','uncertain','absent')),
  provider_key TEXT NOT NULL,
  remote_id TEXT,
  work_id TEXT NOT NULL UNIQUE,
  recovery_ref TEXT,
  cleanup_state TEXT NOT NULL DEFAULT 'pending',
  absent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX test_resources_provider_key ON test_resources(lease_id,kind,provider_key);

CREATE TABLE test_expected_events (
  expectation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  challenge_sha256 TEXT NOT NULL,
  before_sha256 TEXT NOT NULL,
  after_sha256 TEXT NOT NULL,
  marker_sha256 TEXT NOT NULL,
  valid_from_ms INTEGER NOT NULL,
  valid_until_ms INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('planned','live','claimed','disabled')),
  claimed_delivery_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX test_expected_events_live ON test_expected_events(task_id,state,valid_from_ms,valid_until_ms);

CREATE TABLE test_provider_deliveries (
  delivery_id TEXT PRIMARY KEY,
  provider_time_ms INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  team_id TEXT,
  lease_id TEXT,
  run_id TEXT,
  classification TEXT NOT NULL,
  route TEXT NOT NULL CHECK(route IN ('live','test','ignored')),
  expectation_id TEXT,
  marker_audit_sha256 TEXT,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  received_at TEXT NOT NULL
);

CREATE TABLE test_delivery_dispatch (
  delivery_id TEXT PRIMARY KEY REFERENCES test_provider_deliveries(delivery_id),
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  expectation_id TEXT NOT NULL REFERENCES test_expected_events(expectation_id),
  state TEXT NOT NULL CHECK(state IN ('pending','claimed','done','blocked')),
  claim_token TEXT,
  claim_due_at TEXT,
  queue_work_id TEXT NOT NULL UNIQUE,
  send_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json))
);

CREATE TABLE test_operations (
  work_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  expected_description_sha256 TEXT,
  state TEXT NOT NULL CHECK(state IN ('planned','running','done','uncertain','absent')),
  receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json)),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

-- GitHub rejects If-Match on PR body PATCH, so only one DEOS writer may own
-- a body update. An interrupted owner remains held for explicit reconciliation.
CREATE TABLE test_pr_body_writes (
  repository TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  work_id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  state TEXT NOT NULL CHECK(state IN ('planned','writing','verified','blocked')),
  old_body_sha256 TEXT,
  expected_body_sha256 TEXT,
  marker TEXT NOT NULL,
  started_at TEXT NOT NULL,
  verified_at TEXT
);
CREATE TABLE test_pr_body_locks (
  repository TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  work_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('idle','held')),
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(repository,pull_request_number)
);

CREATE TABLE test_attestations (
  attestation_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL UNIQUE REFERENCES test_leases(lease_id),
  repository TEXT NOT NULL,
  candidate_commit TEXT NOT NULL,
  patch_sha256 TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  manifest_revision INTEGER NOT NULL,
  pull_request_number INTEGER NOT NULL,
  base_manifest_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('observed','complete')),
  observed_at TEXT NOT NULL,
  completed_at TEXT,
  close_revision INTEGER
);

CREATE TABLE test_proof_items (
  proof_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  phase TEXT NOT NULL,
  kind TEXT NOT NULL,
  classification TEXT NOT NULL,
  view_rule TEXT NOT NULL,
  capture_recipe TEXT,
  sanitizer_version TEXT,
  sanitizer_result TEXT,
  source_sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_count INTEGER NOT NULL,
  public_sha256 TEXT,
  public_url TEXT,
  body_marker TEXT,
  read_at TEXT,
  projected_at TEXT
);

CREATE TABLE test_cleanup_checks (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  resource_id TEXT NOT NULL REFERENCES test_resources(resource_id),
  remove_work_id TEXT NOT NULL,
  remove_state TEXT NOT NULL,
  read_state TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY(lease_id,resource_id)
);

CREATE TABLE test_lease_closures (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  run_id TEXT NOT NULL,
  close_revision INTEGER NOT NULL,
  attestation_id TEXT NOT NULL REFERENCES test_attestations(attestation_id),
  cleanup_sha256 TEXT NOT NULL,
  absence_sha256 TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)),
  report_state TEXT NOT NULL CHECK(report_state IN ('pending','complete')),
  report_object_key TEXT,
  report_sha256 TEXT,
  report_url TEXT,
  body_read_at TEXT
);

CREATE TABLE test_manual_reconciliations (
  repair_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  resource_id TEXT NOT NULL REFERENCES test_resources(resource_id),
  saved_phase TEXT NOT NULL,
  allowed_action TEXT NOT NULL CHECK(allowed_action IN ('retry','repair_item')),
  expected_revision INTEGER NOT NULL,
  operator_sha256 TEXT NOT NULL,
  choice TEXT,
  proof_sha256 TEXT,
  first_fault_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE test_failures (
  fault_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lease_id TEXT,
  phase TEXT NOT NULL,
  work_id TEXT,
  safe_code TEXT NOT NULL,
  object_key TEXT,
  object_sha256 TEXT,
  first_message TEXT NOT NULL,
  first_stack TEXT,
  causes_json TEXT NOT NULL CHECK(json_valid(causes_json)),
  context_json TEXT NOT NULL CHECK(json_valid(context_json)),
  occurred_at TEXT NOT NULL,
  later_faults_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(later_faults_json))
);
