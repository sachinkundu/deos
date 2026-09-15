-- An operator may recover a complete server-owned review receipt after its
-- wrapper failed. Failed attempts and consumed review budgets remain unchanged.
CREATE TABLE independent_review_receipt_reconciliations (
  reconciliation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  source_attempt_id TEXT NOT NULL UNIQUE REFERENCES agent_attempts(attempt_id),
  failed_attempt_id TEXT NOT NULL UNIQUE REFERENCES agent_attempts(attempt_id),
  plan_digest TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('prepared','applied','established')),
  target_workflow_instance_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER independent_receipt_identity_immutable
BEFORE UPDATE ON independent_review_receipt_reconciliations
WHEN OLD.reconciliation_id IS NOT NEW.reconciliation_id
  OR OLD.run_id IS NOT NEW.run_id
  OR OLD.source_attempt_id IS NOT NEW.source_attempt_id
  OR OLD.failed_attempt_id IS NOT NEW.failed_attempt_id
  OR OLD.plan_digest IS NOT NEW.plan_digest
  OR OLD.plan_json IS NOT NEW.plan_json
  OR OLD.target_workflow_instance_id IS NOT NEW.target_workflow_instance_id
BEGIN SELECT RAISE(ABORT, 'independent receipt reconciliation identity is immutable'); END;
