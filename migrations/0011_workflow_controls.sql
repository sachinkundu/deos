ALTER TABLE project_workflow_policies
ADD COLUMN workflow_revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE project_workflow_policies
ADD COLUMN workflow_updated_by TEXT NOT NULL DEFAULT 'deployment';

ALTER TABLE project_workflow_policies
ADD COLUMN workflow_updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';

UPDATE project_workflow_policies
SET workflow_updated_at = updated_at;
