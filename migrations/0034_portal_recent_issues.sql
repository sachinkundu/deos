CREATE TABLE IF NOT EXISTS portal_recent_issues (
  recency_id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_key TEXT NOT NULL CHECK(length(person_key) BETWEEN 1 AND 80),
  issue_id TEXT NOT NULL CHECK(length(issue_id) BETWEEN 1 AND 128),
  issue_identifier TEXT NOT NULL CHECK(length(issue_identifier) BETWEEN 1 AND 64),
  issue_title TEXT NOT NULL CHECK(length(issue_title) <= 512),
  UNIQUE(person_key, issue_id)
);
CREATE INDEX IF NOT EXISTS portal_recent_issues_person_recency
  ON portal_recent_issues(person_key, recency_id DESC);
