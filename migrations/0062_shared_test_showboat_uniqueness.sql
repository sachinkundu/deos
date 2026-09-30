CREATE UNIQUE INDEX IF NOT EXISTS test_first_showboat_once
ON test_proof_items (lease_id,kind)
WHERE phase='first' AND kind='showboat';
