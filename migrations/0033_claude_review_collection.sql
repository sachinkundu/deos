-- A trusted, immutable completion checkpoint written before review Sandbox cleanup.
CREATE TABLE claude_review_collections (
  attempt_id TEXT PRIMARY KEY REFERENCES agent_attempts(attempt_id),
  job_digest TEXT NOT NULL,
  collection_json TEXT NOT NULL CHECK (json_valid(collection_json))
);
