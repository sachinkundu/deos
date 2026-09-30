-- Retain startup failures without inventing an agent result or test approval.
DROP TRIGGER test_blocked_demo_abort_proof_required;
CREATE TRIGGER test_blocked_demo_abort_proof_required
BEFORE INSERT ON test_lease_aborts WHEN NEW.abort_kind='blocked_demo' AND (
    NEW.attempt_id IS NULL OR NEW.failure_evidence_key IS NULL
    OR NEW.failure_evidence_sha256 IS NULL OR length(NEW.failure_evidence_sha256)<>64 OR NOT EXISTS (
      SELECT 1 FROM test_leases l JOIN agent_attempts a ON a.attempt_id=l.attempt_id
      WHERE l.lease_id=NEW.lease_id AND l.run_id=NEW.run_id
        AND a.run_id=l.run_id AND a.attempt_id=NEW.attempt_id
        AND a.node_id='shared_test_demo' AND (a.state='blocked' OR
          (a.state='failed' AND a.result_class='startup_failed' AND a.process_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM test_github_sessions WHERE lease_id=l.lease_id)))
        AND a.cleanup_state='destroyed' AND a.manifest_id IS NOT NULL
        AND l.activated_at IS NOT NULL AND l.state='quiescing'
    ) OR EXISTS (SELECT 1 FROM test_attestations WHERE lease_id=NEW.lease_id AND state='complete')
      OR EXISTS (SELECT 1 FROM test_review_scenarios WHERE lease_id=NEW.lease_id))
BEGIN
  SELECT RAISE(ABORT,'blocked demo abort needs retained failure proof');
END;
