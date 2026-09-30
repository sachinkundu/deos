-- A failed pre-review demo can retire without becoming release evidence.
-- The original attempt artifacts and captures must be retained and read back.
ALTER TABLE test_lease_aborts ADD COLUMN abort_kind TEXT NOT NULL DEFAULT 'failed_setup'
  CHECK(abort_kind IN ('failed_setup','blocked_demo'));
ALTER TABLE test_lease_aborts ADD COLUMN attempt_id TEXT;
ALTER TABLE test_lease_aborts ADD COLUMN failure_evidence_key TEXT;
ALTER TABLE test_lease_aborts ADD COLUMN failure_evidence_sha256 TEXT;

CREATE TRIGGER test_blocked_demo_abort_proof_required
BEFORE INSERT ON test_lease_aborts WHEN NEW.abort_kind='blocked_demo' AND (
    NEW.attempt_id IS NULL OR NEW.failure_evidence_key IS NULL
    OR NEW.failure_evidence_sha256 IS NULL OR length(NEW.failure_evidence_sha256)<>64 OR NOT EXISTS (
      SELECT 1 FROM test_leases l JOIN agent_attempts a ON a.attempt_id=l.attempt_id
      WHERE l.lease_id=NEW.lease_id AND l.run_id=NEW.run_id
        AND a.run_id=l.run_id AND a.attempt_id=NEW.attempt_id
        AND a.node_id='shared_test_demo' AND a.state='blocked'
        AND a.cleanup_state='destroyed' AND a.manifest_id IS NOT NULL
        AND l.activated_at IS NOT NULL AND l.state='quiescing'
    ) OR EXISTS (SELECT 1 FROM test_attestations WHERE lease_id=NEW.lease_id))
BEGIN
  SELECT RAISE(ABORT,'blocked demo abort needs retained failure proof');
END;
