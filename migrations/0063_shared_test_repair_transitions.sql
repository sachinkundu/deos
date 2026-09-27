CREATE TABLE IF NOT EXISTS test_repair_actions (
  action_id TEXT PRIMARY KEY,
  repair_id TEXT NOT NULL REFERENCES test_manual_reconciliations(repair_id),
  resource_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  operator_sha256 TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('retry','repair_item')),
  acted_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS test_repair_actions_immutable_update
BEFORE UPDATE ON test_repair_actions
BEGIN
  SELECT RAISE(ABORT,'test_repair_action_immutable');
END;

CREATE TRIGGER IF NOT EXISTS test_repair_actions_immutable_delete
BEFORE DELETE ON test_repair_actions
BEGIN
  SELECT RAISE(ABORT,'test_repair_action_immutable');
END;

CREATE TRIGGER IF NOT EXISTS test_repair_block_owner
BEFORE INSERT ON test_manual_reconciliations
WHEN NEW.choice IS NULL
BEGIN
  SELECT CASE WHEN NEW.allowed_action <> 'retry' OR
    NEW.saved_phase NOT IN ('quiescing','cleaning') OR
    NEW.operator_sha256 <> '' OR
    NOT EXISTS (SELECT 1 FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id
      JOIN test_resources r ON r.resource_id=NEW.resource_id
      WHERE e.site_id=1 AND e.state=NEW.saved_phase
        AND e.owner_run_id=NEW.run_id AND e.owner_lease_id=NEW.lease_id
        AND e.revision+1=NEW.expected_revision
        AND l.run_id=NEW.run_id AND l.state=NEW.saved_phase
        AND r.run_id=NEW.run_id AND r.lease_id=NEW.lease_id
        AND r.plan_state<>'absent')
    THEN RAISE(ABORT,'test_repair_block_scope_invalid') END;
  UPDATE test_leases SET state='blocked' WHERE lease_id=NEW.lease_id;
  UPDATE test_environment SET state='blocked',
    hold_reason='repair:' || NEW.repair_id,revision=revision+1
    WHERE site_id=1 AND owner_run_id=NEW.run_id
      AND owner_lease_id=NEW.lease_id;
END;

CREATE TRIGGER IF NOT EXISTS test_repair_retry_owner
BEFORE UPDATE OF choice ON test_manual_reconciliations
WHEN NEW.choice='retry' AND OLD.choice IS NULL
BEGIN
  SELECT CASE WHEN NEW.allowed_action<>'retry' OR
    NEW.operator_sha256='' OR NEW.proof_sha256 IS NOT NULL OR
    NEW.completed_at IS NULL OR NEW.repair_id<>OLD.repair_id OR
    NEW.run_id<>OLD.run_id OR NEW.lease_id<>OLD.lease_id OR
    NEW.resource_id<>OLD.resource_id OR
    NEW.saved_phase<>OLD.saved_phase OR
    NEW.expected_revision<>OLD.expected_revision OR
    NEW.first_fault_id IS NOT OLD.first_fault_id OR
    NOT EXISTS (SELECT 1 FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id
      JOIN test_resources r ON r.resource_id=OLD.resource_id
      WHERE e.site_id=1 AND e.state='blocked'
        AND e.owner_run_id=OLD.run_id AND e.owner_lease_id=OLD.lease_id
        AND e.revision=OLD.expected_revision
        AND e.hold_reason='repair:' || OLD.repair_id
        AND l.run_id=OLD.run_id AND l.state='blocked'
        AND r.run_id=OLD.run_id AND r.lease_id=OLD.lease_id
        AND r.plan_state<>'absent')
    THEN RAISE(ABORT,'test_repair_retry_scope_invalid') END;
  UPDATE test_leases SET state=OLD.saved_phase WHERE lease_id=OLD.lease_id;
  UPDATE test_environment SET state=OLD.saved_phase,hold_reason=NULL,
    revision=revision+1 WHERE site_id=1 AND owner_run_id=OLD.run_id
      AND owner_lease_id=OLD.lease_id;
  INSERT INTO test_repair_actions
    (action_id,repair_id,resource_id,expected_revision,operator_sha256,
     choice,acted_at)
  VALUES (lower(hex(randomblob(16))),OLD.repair_id,OLD.resource_id,
    OLD.expected_revision,NEW.operator_sha256,NEW.choice,NEW.completed_at);
END;
