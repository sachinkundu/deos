CREATE UNIQUE INDEX IF NOT EXISTS test_first_structured_proof_once
ON test_proof_items (lease_id,kind)
WHERE phase='first' AND kind IN ('d1_read','provider_receipt','github_receipt');
