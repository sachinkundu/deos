DROP TRIGGER test_setup_retry_requires_closed_failure;
CREATE TRIGGER test_setup_retry_requires_closed_failure
BEFORE INSERT ON test_setup_retries WHEN NOT EXISTS (
  SELECT 1 FROM test_leases l JOIN test_lease_aborts a ON a.lease_id=l.lease_id
  JOIN test_lease_abort_guards g ON g.lease_id=l.lease_id AND g.ready=1
  JOIN test_lease_requests r ON r.request_id=NEW.request_id
  WHERE l.lease_id=NEW.retired_lease_id AND l.run_id=NEW.run_id
    AND l.candidate_commit=NEW.candidate_commit AND l.state='closed'
    AND a.abort_kind='blocked_demo' AND a.closed_at IS NOT NULL
    AND a.failure_evidence_sha256=NEW.failure_evidence_sha256
    AND r.run_id=l.run_id AND r.candidate_commit=l.candidate_commit
    AND r.patch_sha256=l.patch_sha256 AND r.state='waiting'
    AND (NOT EXISTS (SELECT 1 FROM test_review_scenarios s WHERE s.lease_id=l.lease_id)
      OR EXISTS (SELECT 1 FROM test_review_unpublished_settlements s
        WHERE s.lease_id=l.lease_id AND s.run_id=l.run_id
          AND s.candidate_commit=l.candidate_commit AND s.cleanup_fence=l.fence+1))
    AND NOT EXISTS (SELECT 1 FROM test_attestations t WHERE t.lease_id=l.lease_id AND t.state='complete')
)
BEGIN
  SELECT RAISE(ABORT,'test setup retry requires retained closed failure');
END;
