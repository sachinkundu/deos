ALTER TABLE agent_attempts ADD COLUMN cleanup_hold_until TEXT;
ALTER TABLE agent_attempts ADD COLUMN cleanup_hold_reason TEXT;

CREATE INDEX agent_attempts_cleanup_hold
ON agent_attempts (cleanup_state, cleanup_hold_until);
