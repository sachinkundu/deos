-- Keep the settled scenario available for evidence reads while its successor
-- is prepared. Each lease may have at most one of each state; activation
-- retires the old ready row and promotes the prepared row in one transaction.
DROP INDEX test_review_one_scenario;
CREATE UNIQUE INDEX test_review_one_ready_scenario ON test_review_scenarios(lease_id)
  WHERE state='ready';
CREATE UNIQUE INDEX test_review_one_preparing_scenario ON test_review_scenarios(lease_id)
  WHERE state='preparing';
