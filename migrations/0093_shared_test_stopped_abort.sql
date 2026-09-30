-- Keep failed attempts intact while closing their owned lease after durable collection.
DROP TRIGGER test_blocked_demo_abort_proof_required;
CREATE TRIGGER test_blocked_demo_abort_proof_required
BEFORE INSERT ON test_lease_aborts WHEN NEW.abort_kind='blocked_demo' AND NOT EXISTS (
  SELECT 1 FROM test_invalid_closures i JOIN test_lease_closures c ON c.lease_id=i.lease_id
  WHERE i.lease_id=NEW.lease_id AND i.run_id=NEW.run_id AND i.attempt_id=NEW.attempt_id
    AND i.failure_evidence_key=NEW.failure_evidence_key
    AND i.failure_evidence_sha256=NEW.failure_evidence_sha256
    AND i.cleanup_sha256=NEW.cleanup_sha256 AND i.absence_sha256=NEW.absence_sha256
    AND NEW.closed_at=c.committed_at AND NEW.receipt_json IS NOT NULL
) AND (
    NEW.attempt_id IS NULL OR NEW.failure_evidence_key IS NULL
    OR NEW.failure_evidence_sha256 IS NULL OR length(NEW.failure_evidence_sha256)<>64 OR NOT EXISTS (
      SELECT 1 FROM test_leases l JOIN agent_attempts a ON a.attempt_id=l.attempt_id
      WHERE l.lease_id=NEW.lease_id AND l.run_id=NEW.run_id
        AND a.run_id=l.run_id AND a.attempt_id=NEW.attempt_id
        AND a.node_id='shared_test_demo' AND (a.state='blocked' OR
          (a.state IN ('failed','interrupted','absolute_timeout') AND a.process_id IS NOT NULL
            AND a.result_class<>'startup_failed') OR
          (a.state='failed' AND a.result_class='startup_failed' AND a.process_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM test_github_sessions WHERE lease_id=l.lease_id)))
        AND a.cleanup_state='destroyed' AND a.manifest_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM artifact_manifests m WHERE m.manifest_id=a.manifest_id AND m.state='complete')
        AND l.activated_at IS NOT NULL AND l.state='quiescing'
    ) OR EXISTS (SELECT 1 FROM test_attestations WHERE lease_id=NEW.lease_id AND state='complete')
      OR (EXISTS (SELECT 1 FROM test_review_scenarios WHERE lease_id=NEW.lease_id)
        AND NOT EXISTS (SELECT 1 FROM test_review_unpublished_settlements s
          JOIN test_leases l ON l.lease_id=s.lease_id
          WHERE s.lease_id=NEW.lease_id AND s.run_id=NEW.run_id
            AND s.candidate_commit=l.candidate_commit AND s.cleanup_fence=l.fence+1)))
BEGIN SELECT RAISE(ABORT,'blocked demo abort needs retained failure proof and settled workflows'); END;
