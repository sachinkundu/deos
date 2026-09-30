-- The operator verifies the immutable result and its nonempty blocker before
-- recording this correction. Keep the original attempt and report unchanged.
ALTER TABLE test_invalid_closures ADD COLUMN invalidation_reason TEXT NOT NULL
  DEFAULT 'blocked_attempt' CHECK(invalidation_reason IN ('blocked_attempt','completed_with_blocker'));
DROP TRIGGER test_invalid_closure_subject_required;
CREATE TRIGGER test_invalid_closure_subject_required
BEFORE INSERT ON test_invalid_closures WHEN NOT EXISTS (
  SELECT 1 FROM test_leases l
  JOIN agent_attempts a ON a.attempt_id=l.attempt_id AND a.run_id=l.run_id
  JOIN test_lease_closures c ON c.lease_id=l.lease_id AND c.run_id=l.run_id
  JOIN test_close_transaction_guards g ON g.lease_id=l.lease_id AND g.ready=1
  WHERE l.lease_id=NEW.lease_id AND l.run_id=NEW.run_id AND l.state='closed'
    AND l.candidate_commit=NEW.candidate_commit AND a.attempt_id=NEW.attempt_id
    AND a.node_id='shared_test_demo' AND (
      (a.state='blocked' AND NEW.invalidation_reason='blocked_attempt') OR
      (a.state='completed' AND NEW.invalidation_reason='completed_with_blocker'))
    AND a.cleanup_state='destroyed' AND a.ended_at IS NOT NULL
    AND c.cleanup_sha256=NEW.cleanup_sha256 AND c.absence_sha256=NEW.absence_sha256
    AND NOT EXISTS (SELECT 1 FROM test_resources r WHERE r.lease_id=l.lease_id
      AND (r.plan_state<>'absent' OR r.absent_at IS NULL OR NOT EXISTS (
        SELECT 1 FROM test_cleanup_checks x WHERE x.lease_id=r.lease_id
          AND x.resource_id=r.resource_id AND x.remove_state='done' AND x.read_state='absent')))
    AND NOT EXISTS (SELECT 1 FROM agent_attempts x WHERE x.run_id=l.run_id
      AND x.state IN ('pending','starting','running','collecting'))
    AND NOT EXISTS (SELECT 1 FROM test_leases x WHERE x.run_id=l.run_id AND x.state<>'closed')
)
BEGIN SELECT RAISE(ABORT,'invalid closure needs matching failure classification and recorded absence'); END;

