-- Observation only. Task counts never authorize completion, publication or a gate.
CREATE TABLE implementation_progress (
  attempt_id TEXT PRIMARY KEY REFERENCES implementation_tries(attempt_id),
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  tested_base_sha TEXT NOT NULL,
  completed INTEGER NOT NULL CHECK (completed >= 0),
  total INTEGER NOT NULL CHECK (total >= completed),
  tasks_sha TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
