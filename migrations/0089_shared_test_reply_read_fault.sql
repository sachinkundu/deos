-- One labeled failed receipt read, only after the associated real reply lost
-- its response. Candidate bindings and provider permissions are unchanged.
CREATE TABLE test_review_reply_read_faults (
  injection_id TEXT PRIMARY KEY REFERENCES test_review_fault_injections(injection_id),
  state TEXT NOT NULL CHECK(state IN ('armed','consumed','cleared')),
  request_id TEXT,
  used_at TEXT
);
