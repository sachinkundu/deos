-- Route records remain keyed by the Linear project id. New columns are
-- nullable where an older run or the pre-route deployment seed needs a safe
-- read-only rollout path.
ALTER TABLE project_workflow_policies ADD COLUMN linear_project_name TEXT;
ALTER TABLE project_workflow_policies ADD COLUMN github_installation_id TEXT;
ALTER TABLE project_workflow_policies
ADD COLUMN route_revision INTEGER NOT NULL DEFAULT 1 CHECK (route_revision > 0);
ALTER TABLE project_workflow_policies ADD COLUMN route_digest TEXT;
ALTER TABLE project_workflow_policies
ADD COLUMN route_updated_by TEXT NOT NULL DEFAULT 'deployment';
ALTER TABLE project_workflow_policies
ADD COLUMN route_updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE project_workflow_policies
ADD COLUMN github_access_state TEXT NOT NULL DEFAULT 'unchecked'
CHECK (github_access_state IN ('unchecked', 'passed', 'missing', 'weak_permissions', 'unavailable'));
ALTER TABLE project_workflow_policies ADD COLUMN github_access_checked_at TEXT;
ALTER TABLE project_workflow_policies ADD COLUMN github_access_permissions_digest TEXT;
ALTER TABLE project_workflow_policies ADD COLUMN github_settings_url TEXT;

UPDATE project_workflow_policies
SET route_updated_at = updated_at;

CREATE TABLE github_app_installations (
    installation_id TEXT PRIMARY KEY,
    account_login TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
    target_type TEXT NOT NULL CHECK (target_type IN ('User', 'Organization')),
    repository_selection TEXT NOT NULL CHECK (repository_selection IN ('all', 'selected')),
    permissions_digest TEXT NOT NULL,
    settings_url TEXT NOT NULL,
    suspended INTEGER NOT NULL CHECK (suspended IN (0, 1)),
    observed_at TEXT NOT NULL
);

CREATE TABLE route_access_checks (
    check_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    repository TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    required_permissions_digest TEXT NOT NULL,
    observed_permissions_digest TEXT,
    result TEXT NOT NULL CHECK (
        result IN ('passed', 'missing', 'weak_permissions', 'unavailable')
    ),
    settings_url TEXT,
    safe_error_category TEXT,
    actor_email TEXT NOT NULL,
    checked_at TEXT NOT NULL
);

CREATE INDEX route_access_checks_route_time
ON route_access_checks (project_id, checked_at DESC);

CREATE TABLE route_dispatch_results (
    result_id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    queued_route_revision INTEGER,
    queued_route_digest TEXT,
    outcome TEXT NOT NULL CHECK (
        outcome IN ('stale_route', 'missing_route', 'disabled_route', 'access_denied')
    ),
    safe_error_category TEXT,
    recorded_at TEXT NOT NULL,
    UNIQUE (delivery_id, outcome)
);

CREATE INDEX route_dispatch_results_route_time
ON route_dispatch_results (project_id, recorded_at DESC);

ALTER TABLE deliveries ADD COLUMN route_project_id TEXT;
ALTER TABLE deliveries ADD COLUMN route_revision INTEGER CHECK (route_revision > 0);
ALTER TABLE deliveries ADD COLUMN route_digest TEXT;

ALTER TABLE orchestration_runs ADD COLUMN route_project_name TEXT;
ALTER TABLE orchestration_runs ADD COLUMN route_repository TEXT;
ALTER TABLE orchestration_runs ADD COLUMN route_github_installation_id TEXT;
ALTER TABLE orchestration_runs ADD COLUMN route_revision INTEGER CHECK (route_revision > 0);
ALTER TABLE orchestration_runs ADD COLUMN route_digest TEXT;
ALTER TABLE orchestration_runs ADD COLUMN route_start_state_name TEXT;
ALTER TABLE orchestration_runs ADD COLUMN route_human_gate_state_id TEXT;
ALTER TABLE orchestration_runs ADD COLUMN route_repository_revision INTEGER CHECK (route_repository_revision > 0);
ALTER TABLE orchestration_runs ADD COLUMN route_workflow_revision INTEGER CHECK (route_workflow_revision > 0);
ALTER TABLE orchestration_runs ADD COLUMN route_review_revision INTEGER CHECK (route_review_revision > 0);

CREATE INDEX project_workflow_policies_enabled_route
ON project_workflow_policies (dispatch_enabled, project_id, route_revision);

CREATE INDEX orchestration_runs_frozen_route
ON orchestration_runs (project_id, route_repository, route_github_installation_id, route_revision);
