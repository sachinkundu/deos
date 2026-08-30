CREATE TABLE portal_issue_search_history (
    project_id TEXT NOT NULL,
    viewer_email TEXT NOT NULL COLLATE NOCASE,
    issue_id TEXT NOT NULL,
    searched_at TEXT NOT NULL,
    PRIMARY KEY (project_id, viewer_email, issue_id),
    FOREIGN KEY (issue_id) REFERENCES linear_issue_index(issue_id)
);

CREATE INDEX portal_issue_search_history_viewer
ON portal_issue_search_history (project_id, viewer_email, searched_at DESC);
