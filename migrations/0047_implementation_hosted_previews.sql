-- A maintainer may register an already deployed static preview for a stopped run.
-- This is evidence input, never a deployment capability or a workflow transition.
CREATE TABLE implementation_hosted_previews (
  registration_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  input_sha TEXT NOT NULL,
  candidate_sha TEXT NOT NULL,
  tree_sha TEXT NOT NULL,
  receipt_key TEXT NOT NULL,
  receipt_sha TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX implementation_hosted_previews_run
ON implementation_hosted_previews(run_id, created_at);
CREATE TRIGGER implementation_hosted_preview_immutable
BEFORE UPDATE ON implementation_hosted_previews
BEGIN SELECT RAISE(ABORT, 'hosted preview registration is immutable'); END;
