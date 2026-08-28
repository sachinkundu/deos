ALTER TABLE agent_stage_retries
ADD COLUMN retry_kind TEXT NOT NULL DEFAULT 'same_definition'
CHECK (retry_kind IN ('same_definition', 'compatible_tail'));

ALTER TABLE agent_stage_retries ADD COLUMN source_definition_id TEXT;
ALTER TABLE agent_stage_retries ADD COLUMN source_definition_version INTEGER;
ALTER TABLE agent_stage_retries ADD COLUMN source_definition_digest TEXT;
ALTER TABLE agent_stage_retries ADD COLUMN target_definition_id TEXT;
ALTER TABLE agent_stage_retries ADD COLUMN target_definition_version INTEGER;
ALTER TABLE agent_stage_retries ADD COLUMN target_definition_digest TEXT;
ALTER TABLE agent_stage_retries ADD COLUMN source_workflow_instance_id TEXT;
ALTER TABLE agent_stage_retries ADD COLUMN target_workflow_instance_id TEXT;
ALTER TABLE agent_stage_retries ADD COLUMN source_delivery_id TEXT;

CREATE UNIQUE INDEX agent_stage_retries_target_workflow_instance
ON agent_stage_retries (target_workflow_instance_id)
WHERE target_workflow_instance_id IS NOT NULL AND retry_kind = 'compatible_tail';
