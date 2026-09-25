-- Additive, disabled-by-default review continuation. No provider credentials are stored.
ALTER TABLE project_workflow_policies ADD COLUMN bettaview_continuation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (bettaview_continuation_enabled IN (0, 1));
ALTER TABLE project_workflow_policies ADD COLUMN in_progress_state_id TEXT;
ALTER TABLE project_workflow_policies ADD COLUMN merging_state_id TEXT;
ALTER TABLE project_workflow_policies ADD COLUMN linear_app_actor_id TEXT;
ALTER TABLE orchestration_runs ADD COLUMN frozen_access_account TEXT;
ALTER TABLE orchestration_runs ADD COLUMN frozen_github_user_id INTEGER;
ALTER TABLE orchestration_runs ADD COLUMN frozen_linear_user_id TEXT;
ALTER TABLE orchestration_runs ADD COLUMN bettaview_account_policy_version INTEGER;

CREATE TRIGGER orchestration_runs_bettaview_identity_all_or_none_insert
BEFORE INSERT ON orchestration_runs
WHEN ((NEW.frozen_access_account IS NOT NULL) + (NEW.frozen_github_user_id IS NOT NULL)
    + (NEW.frozen_linear_user_id IS NOT NULL) + (NEW.bettaview_account_policy_version IS NOT NULL)) NOT IN (0, 4)
BEGIN SELECT RAISE(ABORT, 'frozen BettaView identity must be all-or-none'); END;
CREATE TRIGGER orchestration_runs_bettaview_identity_immutable
BEFORE UPDATE OF frozen_access_account, frozen_github_user_id, frozen_linear_user_id, bettaview_account_policy_version ON orchestration_runs
WHEN NEW.frozen_access_account IS NOT OLD.frozen_access_account OR NEW.frozen_github_user_id IS NOT OLD.frozen_github_user_id
  OR NEW.frozen_linear_user_id IS NOT OLD.frozen_linear_user_id OR NEW.bettaview_account_policy_version IS NOT OLD.bettaview_account_policy_version
BEGIN SELECT RAISE(ABORT, 'frozen BettaView identity is immutable'); END;

CREATE TABLE project_bettaview_accounts (
  project_id TEXT NOT NULL, policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  access_account TEXT NOT NULL, github_user_id INTEGER NOT NULL CHECK (github_user_id > 0), linear_user_id TEXT NOT NULL,
  provider_evidence_digest TEXT NOT NULL CHECK (length(provider_evidence_digest) = 64), settings_actor TEXT NOT NULL,
  route_revision INTEGER NOT NULL CHECK (route_revision > 0), status TEXT NOT NULL CHECK (status IN ('current','superseded','rejected')),
  human_review_state_id TEXT NOT NULL, in_progress_state_id TEXT NOT NULL, merging_state_id TEXT NOT NULL,
  created_at TEXT NOT NULL, activated_at TEXT, superseded_at TEXT,
  PRIMARY KEY (project_id, policy_version),
  CHECK ((status='current' AND activated_at IS NOT NULL AND superseded_at IS NULL)
    OR (status='superseded' AND activated_at IS NOT NULL AND superseded_at IS NOT NULL)
    OR (status='rejected' AND activated_at IS NULL))
);
CREATE UNIQUE INDEX project_bettaview_accounts_one_current ON project_bettaview_accounts(project_id) WHERE status='current';
CREATE TRIGGER project_bettaview_accounts_immutable_identity
BEFORE UPDATE OF access_account, github_user_id, linear_user_id, provider_evidence_digest, settings_actor, route_revision,
  human_review_state_id, in_progress_state_id, merging_state_id ON project_bettaview_accounts
BEGIN SELECT RAISE(ABORT, 'BettaView account policy facts are immutable'); END;
CREATE TABLE bettaview_account_audit (
  audit_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, policy_version INTEGER,
  event TEXT NOT NULL CHECK (event IN ('provider_read','activated','rejected','rotated')), settings_actor TEXT NOT NULL,
  safe_facts_json TEXT NOT NULL CHECK (json_valid(safe_facts_json)), provider_message TEXT,
  cause_chain_json TEXT CHECK (cause_chain_json IS NULL OR json_valid(cause_chain_json)), created_at TEXT NOT NULL,
  FOREIGN KEY (project_id, policy_version) REFERENCES project_bettaview_accounts(project_id, policy_version)
);

CREATE TABLE review_intents (
  review_id TEXT PRIMARY KEY, bound_digest TEXT NOT NULL CHECK (length(bound_digest)=64), supersedes_review_id TEXT,
  run_id TEXT NOT NULL, issue_id TEXT NOT NULL, repository TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL CHECK (pull_request_number>0), head_sha TEXT NOT NULL CHECK (length(head_sha)=40),
  gate_visit_sequence INTEGER NOT NULL CHECK (gate_visit_sequence>0),
  review_type TEXT NOT NULL CHECK (review_type IN ('COMMENT','REQUEST_CHANGES','APPROVE')),
  account_policy_version INTEGER NOT NULL CHECK (account_policy_version>0), target_state_id TEXT NOT NULL,
  target_state_name TEXT NOT NULL CHECK (target_state_name IN ('In Progress','Merging')), target_edge TEXT NOT NULL,
  github_status TEXT NOT NULL DEFAULT 'not_started' CHECK (github_status IN ('not_started','publishing','failed_retryable','done','host_check_required','abandoned')),
  linear_status TEXT NOT NULL DEFAULT 'not_started' CHECK (linear_status IN ('not_started','moving','failed_retryable','awaiting_delivery','reverting','reverted','done','host_check_required')),
  outcome TEXT NOT NULL DEFAULT 'active' CHECK (outcome IN ('active','continued','abandoned_before_linear','abandoned_stale_after_linear','conflict','host_check_required')),
  linear_operation_id TEXT UNIQUE, linear_delivery_deadline TEXT, review_ready_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, terminal_at TEXT,
  FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
  FOREIGN KEY (run_id,gate_visit_sequence) REFERENCES human_gate_visits(run_id,visit_sequence),
  FOREIGN KEY (supersedes_review_id) REFERENCES review_intents(review_id),
  CHECK ((outcome='active' AND terminal_at IS NULL) OR (outcome<>'active' AND terminal_at IS NOT NULL)),
  CHECK ((linear_status='awaiting_delivery' AND linear_delivery_deadline IS NOT NULL) OR linear_status<>'awaiting_delivery')
);
CREATE UNIQUE INDEX review_intents_bound_digest ON review_intents(bound_digest);
CREATE TABLE review_content_items (
  review_id TEXT NOT NULL, content_item_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('reply','inline','review_body')),
  ordinal INTEGER NOT NULL CHECK (ordinal>=0), body TEXT NOT NULL, content_digest TEXT NOT NULL CHECK (length(content_digest)=64),
  target_json TEXT NOT NULL CHECK (json_valid(target_json)), target_digest TEXT NOT NULL CHECK (length(target_digest)=64), created_at TEXT NOT NULL,
  PRIMARY KEY (review_id,content_item_id), UNIQUE(review_id,ordinal), FOREIGN KEY(review_id) REFERENCES review_intents(review_id)
);
CREATE TABLE review_continuation_leases (
  run_id TEXT NOT NULL, gate_visit_sequence INTEGER NOT NULL, review_id TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL CHECK (phase IN ('publishing','linear_pending','repairing')), acquired_at TEXT NOT NULL,
  released_at TEXT, release_reason TEXT, PRIMARY KEY(review_id),
  FOREIGN KEY(run_id,gate_visit_sequence) REFERENCES human_gate_visits(run_id,visit_sequence), FOREIGN KEY(review_id) REFERENCES review_intents(review_id),
  CHECK ((released_at IS NULL AND release_reason IS NULL) OR (released_at IS NOT NULL AND release_reason IS NOT NULL))
);
CREATE UNIQUE INDEX review_continuation_one_active_lease ON review_continuation_leases(run_id,gate_visit_sequence) WHERE released_at IS NULL;
CREATE TABLE review_parts (
  review_id TEXT NOT NULL, part_id TEXT NOT NULL, content_item_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('reply','review_bundle')), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  content_digest TEXT NOT NULL CHECK(length(content_digest)=64), target_digest TEXT NOT NULL CHECK(length(target_digest)=64),
  marker_version INTEGER NOT NULL DEFAULT 1 CHECK(marker_version=1),
  receipt_status TEXT NOT NULL DEFAULT 'pending' CHECK(receipt_status IN ('pending','done','failed_retryable','host_check_required','published_prior_intent','abandoned')),
  github_record_id TEXT, github_url TEXT, github_commit_sha TEXT, github_user_id INTEGER, github_event TEXT,
  provider_receipt_digest TEXT, created_at TEXT NOT NULL, completed_at TEXT,
  PRIMARY KEY(review_id,part_id), UNIQUE(review_id,ordinal), UNIQUE(github_record_id),
  FOREIGN KEY(review_id) REFERENCES review_intents(review_id),
  FOREIGN KEY(review_id,content_item_id) REFERENCES review_content_items(review_id,content_item_id),
  CHECK ((receipt_status IN ('done','published_prior_intent') AND github_record_id IS NOT NULL AND completed_at IS NOT NULL)
    OR receipt_status NOT IN ('done','published_prior_intent'))
);
CREATE TABLE review_attempts (
  review_id TEXT NOT NULL, step TEXT NOT NULL CHECK(step IN ('github','linear','repair')), scope_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation>0), permit_id TEXT NOT NULL UNIQUE,
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64), provider_operation_id TEXT, fault_id TEXT,
  outcome TEXT CHECK(outcome IN ('succeeded','clearly_rejected','unclear','abandoned')), started_at TEXT NOT NULL, finished_at TEXT,
  PRIMARY KEY(review_id,step,scope_id,generation), FOREIGN KEY(review_id) REFERENCES review_intents(review_id),
  FOREIGN KEY(provider_operation_id) REFERENCES provider_operations(operation_id)
);
CREATE UNIQUE INDEX review_attempts_one_active_generation ON review_attempts(review_id,step,scope_id) WHERE finished_at IS NULL;
CREATE TABLE review_proof_nonces (
  key_version INTEGER NOT NULL CHECK(key_version>0), nonce TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64), consumed_at TEXT NOT NULL, PRIMARY KEY(key_version,nonce)
);
CREATE TABLE review_action_tokens (
  token_digest TEXT PRIMARY KEY CHECK(length(token_digest)=64), review_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('retry','abandon','replace')), scope_id TEXT NOT NULL,
  expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY(review_id) REFERENCES review_intents(review_id)
);
CREATE TABLE review_ready_events (
  review_id TEXT PRIMARY KEY, event_digest TEXT NOT NULL UNIQUE CHECK(length(event_digest)=64),
  state TEXT NOT NULL CHECK(state IN ('pending','claimed','processed','failed')), created_at TEXT NOT NULL, processed_at TEXT,
  FOREIGN KEY(review_id) REFERENCES review_intents(review_id)
);
CREATE TABLE review_faults (
  fault_id TEXT PRIMARY KEY, review_id TEXT NOT NULL, operation_id TEXT,
  provider TEXT NOT NULL CHECK(provider IN ('github','linear','d1','service_auth')), public_code TEXT NOT NULL,
  first_provider_message TEXT NOT NULL, cause_chain_json TEXT NOT NULL CHECK(json_valid(cause_chain_json)),
  safe_act_facts_json TEXT NOT NULL CHECK(json_valid(safe_act_facts_json)), redaction_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, FOREIGN KEY(review_id) REFERENCES review_intents(review_id)
);
CREATE UNIQUE INDEX review_faults_first_operation_error ON review_faults(review_id,operation_id) WHERE operation_id IS NOT NULL;
CREATE TABLE review_repairs (
  repair_id TEXT PRIMARY KEY, review_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('delivery_scan','restore_human_review','operator_retain','operator_abandon')),
  provider_operation_id TEXT, signed_delivery_id TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('pending','proved','host_check_required','conflict')),
  facts_json TEXT NOT NULL CHECK(json_valid(facts_json)), created_at TEXT NOT NULL, completed_at TEXT,
  FOREIGN KEY(review_id) REFERENCES review_intents(review_id), FOREIGN KEY(provider_operation_id) REFERENCES provider_operations(operation_id),
  FOREIGN KEY(signed_delivery_id) REFERENCES workflow_event_inbox(delivery_id)
);
CREATE TABLE review_ops_items (
  review_id TEXT PRIMARY KEY, ops_key TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN ('open','resolved')),
  safe_summary TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(review_id) REFERENCES review_intents(review_id)
);
CREATE TRIGGER review_intents_terminal_immutable BEFORE UPDATE ON review_intents
WHEN OLD.outcome<>'active' AND (NEW.outcome IS NOT OLD.outcome OR NEW.github_status IS NOT OLD.github_status
  OR NEW.linear_status IS NOT OLD.linear_status OR NEW.linear_operation_id IS NOT OLD.linear_operation_id)
BEGIN SELECT RAISE(ABORT, 'terminal review intent is immutable'); END;
ALTER TABLE provider_operations ADD COLUMN review_id TEXT REFERENCES review_intents(review_id);
ALTER TABLE workflow_event_inbox ADD COLUMN review_id TEXT REFERENCES review_intents(review_id);
ALTER TABLE workflow_transitions_v2 ADD COLUMN review_id TEXT REFERENCES review_intents(review_id);
ALTER TABLE workflow_errors ADD COLUMN review_id TEXT REFERENCES review_intents(review_id);
