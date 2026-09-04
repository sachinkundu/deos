import sqlite3
from pathlib import Path

import pytest


def database() -> sqlite3.Connection:
    value = sqlite3.connect(":memory:")
    value.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        value.executescript(migration.read_text())
    return value


def seed(value: sqlite3.Connection) -> None:
    value.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('simple-traceability', 19, 'project-1', 'test', '{}', 'digest', 'now')"""
    )
    value.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            current_visit_sequence, status, created_at, updated_at)
           VALUES ('run-1', 'correlation-1', 1, 'project-1', 'issue-1',
                   'simple-traceability', 19, 'digest', 'instance-1', 'design_review',
                   20, 'active', 'now', 'now')"""
    )
    value.execute(
        """INSERT INTO agent_attempts
           (attempt_id, sandbox_id, run_id, node_id, job_spec_json, job_spec_digest,
            state, absolute_deadline, created_at, updated_at)
           VALUES ('author-1', 'sandbox-1', 'run-1', 'design_author', '{}', 'digest',
                   'completed', 'later', 'now', 'now')"""
    )
    value.execute(
        """INSERT INTO design_candidates
           (candidate_id, run_id, round, source_attempt_id, base_commit, change_id,
            design_digest, candidate_digest, candidate_r2_key, candidate_sha256,
            validation_r2_key, validation_sha256, state, created_at, accepted_at)
           VALUES ('design:author-1', 'run-1', 1, 'author-1', ?, 'sample-change', ?, ?,
                   'design/candidate.json', ?, 'design/validation.json', ?,
                   'validated', 'now', 'now')""",
        ("a" * 40, "b" * 64, "c" * 64, "d" * 64, "e" * 64),
    )


def test_review_round_constraints_are_additive_and_fail_closed() -> None:
    value = database()
    seed(value)
    value.execute(
        """INSERT INTO design_review_rounds
           (round_id, run_id, round_no, kind, self_required, author_provider,
            author_model, author_reasoning, outside_provider, outside_model,
            outside_reasoning, status, created_at, updated_at)
           VALUES ('round-1', 'run-1', 1, 'initial', 1, 'codex', 'gpt-5.6-sol',
                   'high', 'openrouter', 'outside/model', 'high', 'active', 'now', 'now')"""
    )
    assert value.execute("PRAGMA foreign_key_check").fetchall() == []
    with pytest.raises(sqlite3.IntegrityError):
        value.execute(
            """INSERT INTO design_review_rounds
               (round_id, run_id, round_no, kind, self_required, author_provider,
                author_model, author_reasoning, outside_provider, outside_model,
                outside_reasoning, status, created_at, updated_at)
               VALUES ('round-2', 'run-1', 2, 'human_revision', 1, 'codex', 'author',
                       'high', 'openrouter', 'outside', 'high', 'active', 'now', 'now')"""
        )


def test_review_retries_share_immutable_input_but_only_one_result_is_accepted() -> None:
    value = database()
    seed(value)
    value.execute(
        """INSERT INTO design_review_rounds
           (round_id, run_id, round_no, kind, self_required, author_provider,
            author_model, author_reasoning, outside_provider, outside_model,
            outside_reasoning, status, created_at, updated_at)
           VALUES ('round-1', 'run-1', 1, 'initial', 1, 'codex', 'author', 'high',
                   'openrouter', 'outside', 'high', 'active', 'now', 'now')"""
    )
    for attempt_id in ("review-agent-1", "review-agent-2"):
        value.execute(
            """INSERT INTO agent_attempts
               (attempt_id, sandbox_id, run_id, node_id, job_spec_json, job_spec_digest,
                state, absolute_deadline, created_at, updated_at)
               VALUES (?, ?, 'run-1', 'design_self_review', '{}', 'digest',
                       'completed', 'later', 'now', 'now')""",
            (attempt_id, f"sandbox-{attempt_id}"),
        )
    value.execute(
        """INSERT INTO artifact_manifests
           (manifest_id, run_id, attempt_id, r2_key, state, aggregate_digest,
            object_count, total_bytes, created_at, completed_at)
           VALUES ('manifest-2', 'run-1', 'review-agent-2', 'manifest/2.json',
                   'complete', 'digest', 1, 10, 'now', 'now')"""
    )
    common = ("f" * 64, "review/input.json", "f" * 64)
    value.execute(
        """INSERT INTO design_review_attempts
           (review_attempt_id, round_id, agent_attempt_id, phase, input_sha256,
            input_r2_key, input_object_sha256, candidate_id, model_provider, model,
            reasoning, outcome, accepted, created_at, completed_at)
           VALUES ('review-1', 'round-1', 'review-agent-1', 'self', ?, ?, ?,
                   'design:author-1', 'codex', 'author', 'high', 'failed', 0, 'now', 'now')""",
        common,
    )
    value.execute(
        """INSERT INTO design_review_attempts
           (review_attempt_id, round_id, agent_attempt_id, phase, input_sha256,
            input_r2_key, input_object_sha256, candidate_id, model_provider, model,
            reasoning, outcome, evidence_manifest_id, evidence_r2_key, evidence_sha256,
            accepted, created_at, completed_at)
           VALUES ('review-2', 'round-1', 'review-agent-2', 'self', ?, ?, ?,
                   'design:author-1', 'codex', 'author', 'high', 'pass', 'manifest-2',
                   'review/result.json', ?, 1, 'now', 'now')""",
        (*common, "a" * 64),
    )
    with pytest.raises(sqlite3.IntegrityError):
        value.execute(
            """INSERT INTO design_review_attempts
               (review_attempt_id, round_id, phase, input_sha256, input_r2_key,
                input_object_sha256, candidate_id, model_provider, model, reasoning,
                outcome, evidence_manifest_id, evidence_r2_key, evidence_sha256,
                accepted, created_at, completed_at)
               VALUES ('review-3', 'round-1', 'self', ?, 'review/input-copy.json', ?,
                       'design:author-1', 'codex', 'author', 'high', 'pass', 'manifest-2',
                       'review/result.json', ?, 1, 'now', 'now')""",
            ("f" * 64, "f" * 64, "a" * 64),
        )
    assert value.execute("PRAGMA foreign_key_check").fetchall() == []


def test_design_review_retry_nodes_are_additive() -> None:
    value = database()
    seed(value)
    for index, node in enumerate((
        "design_self_review", "design_independent_review",
        "design_self_response", "design_independent_response",
    ), start=1):
        attempt_id = f"failed-{index}"
        value.execute(
            """INSERT INTO agent_attempts
               (attempt_id, sandbox_id, run_id, node_id, job_spec_json, job_spec_digest,
                state, absolute_deadline, created_at, updated_at)
               VALUES (?, ?, 'run-1', ?, '{}', 'digest', 'failed', 'later', 'now', 'now')""",
            (attempt_id, f"sandbox-failed-{index}", node),
        )
        value.execute(
            """INSERT INTO agent_stage_retries
               (retry_id, run_id, failed_attempt_id, retry_node, from_visit_sequence,
                to_visit_sequence, transition_id, state, requested_by, created_at, updated_at)
               VALUES (?, 'run-1', ?, ?, ?, ?, ?, 'pending', 'operator', 'now', 'now')""",
            (f"retry-{index}", attempt_id, node, index, index + 1, f"transition-{index}"),
        )
    assert value.execute("SELECT COUNT(*) FROM agent_stage_retries").fetchone() == (4,)


def test_unbounded_design_review_migration_preserves_existing_rows() -> None:
    value = sqlite3.connect(":memory:")
    value.execute("PRAGMA foreign_keys = ON")
    migrations = sorted(Path("migrations").glob("*.sql"))
    for migration in migrations:
        if migration.name == "0026_unbounded_design_review_context.sql":
            break
        value.executescript(migration.read_text())
    seed(value)
    value.execute(
        """INSERT INTO design_review_rounds
           (round_id, run_id, round_no, kind, self_required, author_provider,
            author_model, author_reasoning, outside_provider, outside_model,
            outside_reasoning, status, response_turns, created_at, updated_at)
           VALUES ('round-1', 'run-1', 1, 'initial', 1, 'codex', 'author', 'high',
                   'openrouter', 'outside', 'high', 'active', 3, 'now', 'now')"""
    )
    value.execute(
        """INSERT INTO design_review_attempts
           (review_attempt_id, round_id, agent_attempt_id, phase, input_sha256,
            input_r2_key, input_object_sha256, candidate_id, model_provider, model,
            reasoning, outcome, accepted, created_at, completed_at)
           VALUES ('review-1', 'round-1', 'author-1', 'self', ?, 'review/input.json', ?,
                   'design:author-1', 'codex', 'author', 'high', 'concerns', 0, 'now', 'now')""",
        ("f" * 64, "f" * 64),
    )
    value.execute(
        """INSERT INTO design_review_findings
           (review_attempt_id, finding_id, severity, category, message,
            source_ranges_json, created_at)
           VALUES ('review-1', 'finding-1', 'high', 'correctness', ?, '[]', 'now')""",
        ("m" * 4000,),
    )
    value.execute(
        """INSERT INTO design_review_dispositions
           (review_attempt_id, finding_id, author_attempt_id, disposition, reason,
            resulting_candidate_id, created_at)
           VALUES ('review-1', 'finding-1', 'author-1', 'applied', ?,
                   'design:author-1', 'now')""",
        ("r" * 4000,),
    )

    migration = next(item for item in migrations if item.name == "0026_unbounded_design_review_context.sql")
    value.executescript(migration.read_text())
    value.execute("UPDATE design_review_rounds SET response_turns = 4 WHERE round_id = 'round-1'")
    value.execute("UPDATE design_review_findings SET message = ? WHERE finding_id = 'finding-1'", ("m" * 5000,))
    value.execute("UPDATE design_review_dispositions SET reason = ? WHERE finding_id = 'finding-1'", ("r" * 5000,))

    assert value.execute(
        "SELECT response_turns FROM design_review_rounds WHERE round_id = 'round-1'"
    ).fetchone() == (4,)
    assert value.execute(
        "SELECT length(message) FROM design_review_findings WHERE finding_id = 'finding-1'"
    ).fetchone() == (5000,)
    assert value.execute(
        "SELECT length(reason) FROM design_review_dispositions WHERE finding_id = 'finding-1'"
    ).fetchone() == (5000,)
    assert value.execute("PRAGMA foreign_key_check").fetchall() == []
