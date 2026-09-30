-- Automated demos use the already approved reviewer credential in the trusted
-- coordinator. Store only its source and the disposable fixture, never a copy.
ALTER TABLE test_github_sessions ADD COLUMN credential_source TEXT NOT NULL
  DEFAULT 'oauth' CHECK(credential_source IN ('oauth','test_reviewer'));
ALTER TABLE test_github_sessions ADD COLUMN fixture_resource_id TEXT;
ALTER TABLE test_github_sessions ADD COLUMN github_user_id INTEGER;
