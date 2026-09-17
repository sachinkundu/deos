-- Additive only: historical definitions, routes and gate records retain their meaning.
ALTER TABLE project_workflow_policies ADD COLUMN allowed_access_email TEXT;
ALTER TABLE project_workflow_policies ADD COLUMN allowed_linear_user_id TEXT;
ALTER TABLE project_workflow_policies ADD COLUMN human_binding_revision INTEGER;
ALTER TABLE project_workflow_policies ADD COLUMN human_binding_checked_at TEXT;
ALTER TABLE orchestration_runs ADD COLUMN allowed_linear_user_id TEXT;
ALTER TABLE orchestration_runs ADD COLUMN human_binding_revision INTEGER;
ALTER TABLE workflow_event_inbox ADD COLUMN comment_id TEXT;

CREATE TABLE implementation_runs (
  run_id TEXT PRIMARY KEY REFERENCES orchestration_runs(run_id),
  linear_identifier TEXT NOT NULL,
  issue_run_sequence INTEGER NOT NULL CHECK(issue_run_sequence > 0),
  change_id TEXT NOT NULL,
  approved_design_sha TEXT NOT NULL CHECK(length(approved_design_sha) = 40),
  tested_base_sha TEXT NOT NULL CHECK(length(tested_base_sha) = 40),
  branch TEXT NOT NULL UNIQUE,
  allowed_linear_user_id TEXT NOT NULL,
  human_binding_revision INTEGER NOT NULL,
  input_key TEXT NOT NULL, input_sha TEXT NOT NULL,
  approved_files_json TEXT NOT NULL CHECK(json_valid(approved_files_json)),
  requirements_json TEXT NOT NULL CHECK(json_valid(requirements_json)),
  status TEXT NOT NULL DEFAULT 'tasks',
  tree_sha TEXT, candidate_key TEXT, candidate_sha TEXT,
  patch_key TEXT, patch_sha TEXT, patch_base_sha TEXT, source_attempt_id TEXT,
  pr_number INTEGER, pr_url TEXT, pr_head_sha TEXT, merge_sha TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE implementation_tries (
  attempt_id TEXT PRIMARY KEY REFERENCES agent_attempts(attempt_id),
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  try_sequence INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('tasks','build')),
  sandbox_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  tested_base_sha TEXT NOT NULL,
  input_patch_sha TEXT, output_patch_sha TEXT,
  primary_error_manifest TEXT, public_error_code TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(run_id, try_sequence)
);
CREATE TABLE implementation_resources (
  resource_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  attempt_id TEXT NOT NULL REFERENCES implementation_tries(attempt_id),
  kind TEXT NOT NULL CHECK(kind IN ('browser','preview','local_data','safe_test')),
  slot_id TEXT NOT NULL UNIQUE, allocation_op TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL, provider_resource_id TEXT UNIQUE,
  namespace TEXT UNIQUE, local_persist_path TEXT UNIQUE, preview_origin TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('allocating','ready','quarantined','destroyed')),
  create_window TEXT, quarantine_until TEXT, cleanup_receipt TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(attempt_id, kind)
);
CREATE TABLE implementation_browser_leases (
  account_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE implementation_branch_publications (
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id), branch_sequence INTEGER NOT NULL,
  tested_base_sha TEXT NOT NULL, tree_sha TEXT NOT NULL, operation_key TEXT NOT NULL UNIQUE,
  commit_sha TEXT, prior_ref_sha TEXT, status TEXT NOT NULL, provider_receipt TEXT,
  created_at TEXT NOT NULL, PRIMARY KEY(run_id, branch_sequence),
  UNIQUE(run_id, tested_base_sha, tree_sha)
);
CREATE TABLE implementation_publications (
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id), publication_sequence INTEGER NOT NULL,
  publication_digest TEXT NOT NULL, tested_base_sha TEXT NOT NULL, tree_sha TEXT NOT NULL,
  proof_manifest_sha TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL, provider_receipt TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(run_id, publication_sequence), UNIQUE(run_id, publication_digest)
);
CREATE TABLE implementation_proof_requirements (
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id), requirement_sequence INTEGER NOT NULL,
  approved_input_digest TEXT NOT NULL, diff_sha TEXT NOT NULL,
  requirements_json TEXT NOT NULL CHECK(json_valid(requirements_json)), created_at TEXT NOT NULL,
  PRIMARY KEY(run_id, requirement_sequence), UNIQUE(run_id, diff_sha)
);
CREATE TABLE implementation_proof (
  proof_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  attempt_id TEXT NOT NULL REFERENCES implementation_tries(attempt_id),
  kind TEXT NOT NULL CHECK(kind IN ('browser_image','showboat','provider_originated','synthetic_ingress','unit_test')),
  approved_design_sha TEXT NOT NULL, tested_base_sha TEXT NOT NULL, tree_sha TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL,
  media_type TEXT NOT NULL, caption TEXT NOT NULL, sanitized INTEGER NOT NULL CHECK(sanitized IN (0,1)),
  provider_delivery_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE implementation_doc_access (
  access_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
  url TEXT NOT NULL, title TEXT NOT NULL, content_returned INTEGER NOT NULL,
  r2_key TEXT NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE implementation_doc_sources (
  source_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
  url TEXT NOT NULL, title TEXT NOT NULL, claim TEXT NOT NULL, artifact_locator TEXT NOT NULL,
  access_event_id TEXT NOT NULL REFERENCES implementation_doc_access(access_id),
  r2_key TEXT NOT NULL, sha256 TEXT NOT NULL, UNIQUE(attempt_id, url)
);
CREATE TABLE implementation_questions (
  question_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  block_key TEXT NOT NULL, gate_visit INTEGER NOT NULL,
  linear_comment_id TEXT, opened_delivery_id TEXT NOT NULL, opened_at TEXT NOT NULL,
  question_key TEXT NOT NULL, question_sha TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','answered','closed')),
  answer_delivery_id TEXT UNIQUE, answer_comment_id TEXT, answer_actor_id TEXT,
  reply_key TEXT, reply_sha TEXT, UNIQUE(run_id, block_key)
);
CREATE UNIQUE INDEX implementation_one_open_question ON implementation_questions(run_id) WHERE status IN ('open','answered');
CREATE TABLE implementation_gates (
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id), visit_sequence INTEGER NOT NULL,
  node_id TEXT NOT NULL, expected_event_kind TEXT NOT NULL CHECK(expected_event_kind IN ('comment','state')),
  allowed_linear_user_id TEXT NOT NULL, issue_id TEXT NOT NULL, human_state_id TEXT NOT NULL,
  question_id TEXT REFERENCES implementation_questions(question_id), pr_number INTEGER, head_sha TEXT, base_sha TEXT,
  state TEXT NOT NULL DEFAULT 'open', decision_delivery_id TEXT UNIQUE,
  decision_outcome TEXT, opened_at TEXT NOT NULL, decided_at TEXT,
  PRIMARY KEY(run_id, visit_sequence)
);
CREATE UNIQUE INDEX implementation_one_open_gate ON implementation_gates(run_id) WHERE state = 'open';
CREATE TABLE implementation_gate_events (
  delivery_id TEXT PRIMARY KEY REFERENCES workflow_event_inbox(delivery_id),
  run_id TEXT NOT NULL, gate_visit INTEGER NOT NULL, decision TEXT NOT NULL, recorded_at TEXT NOT NULL
);
CREATE TABLE implementation_effect_errors (
  error_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, attempt_id TEXT,
  operation TEXT NOT NULL, r2_key TEXT NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL
);
