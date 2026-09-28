-- A new test run keeps its unique run branch identity in `branch`, while
-- `pr_branch` records the existing pull request branch it is validating.
-- The frozen source row and all of its foreign-keyed evidence remain intact.
ALTER TABLE implementation_runs ADD COLUMN pr_branch TEXT;
