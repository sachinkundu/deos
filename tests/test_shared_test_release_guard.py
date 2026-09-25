"""Release proof is tied to the merge bytes and exact saved path decision."""

import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import shared_test_release_guard as guard

BASE, CANDIDATE, RELEASE, TREE = (letter * 40 for letter in "abcd")
PATCH = "e" * 64
PATH = "portal/src/worker.ts"


class LocalClient:
    def __init__(self):
        self.sqlite = sqlite3.connect(":memory:", isolation_level=None)
        self.sqlite.row_factory = sqlite3.Row
        self.sqlite.executescript((ROOT / "migrations/0055_shared_test_environment.sql").read_text())

    def query(self, sql, params=()):
        return {"results": [dict(row) for row in self.sqlite.execute(sql, params)]}

    def seed(self):
        service = {"serviceName": "portal", "sourceCommit": BASE,
                   "deployVersion": "version-1", "buildInputSha256": "f" * 64,
                   "appPaths": ["portal/"], "providerPaths": ["src/deos/"]}
        digest = guard._sha(guard._canonical([service]))
        self.sqlite.execute("""INSERT INTO staging_release_manifests
            (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
            VALUES ('manifest-1',1,'traffic-1',1,?,'now')""", (digest,))
        self.sqlite.execute("""INSERT INTO staging_release_services
            (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
             app_paths_json,provider_paths_json,read_at)
            VALUES ('manifest-1','portal',?,?,?,'["portal/"]','["src/deos/"]','now')""",
                            (BASE, "version-1", "f" * 64))
        self.sqlite.execute("""INSERT INTO test_task_decisions
            (run_id,candidate_commit,patch_sha256,manifest_id,manifest_revision,
             changed_paths_sha256,choice,matched_paths_json,created_at)
            VALUES ('run-1',?,?,'manifest-1',1,?,'test_required',?,'now')""",
                            (CANDIDATE, PATCH, guard._sha(guard._canonical([PATH])),
                             json.dumps([PATH])))
        self.sqlite.execute("""INSERT INTO test_release_commit_links
            (release_commit_sha,run_id,candidate_commit_sha,tested_base_sha,tree_sha,
             patch_sha256,manifest_id,manifest_revision,choice,pull_request_number,recorded_at)
            VALUES (?,'run-1',?,?,?,?, 'manifest-1',1,'test_required',150,'now')""",
                            (RELEASE, CANDIDATE, BASE, TREE, PATCH))

    def complete(self):
        self.sqlite.execute("""INSERT INTO test_attestations
            (attestation_id,task_id,run_id,lease_id,repository,candidate_commit,
             patch_sha256,manifest_id,manifest_revision,pull_request_number,
             base_manifest_id,state,observed_at)
            VALUES ('att-1','issue-1','run-1','lease-1','owner/repo',?,?,'manifest-1',
                    1,150,'manifest-1','complete','now')""", (CANDIDATE, PATCH))
        self.sqlite.execute("""INSERT INTO test_lease_closures
            (lease_id,run_id,close_revision,attestation_id,cleanup_sha256,
             absence_sha256,committed_at,receipt_json,report_state)
            VALUES ('lease-1','run-1',3,'att-1',?,?,'now','{}','complete')""",
                            ("a" * 64, "b" * 64))


def test_required_release_needs_complete_report_and_exact_merge(monkeypatch):
    client = LocalClient()
    client.seed()
    monkeypatch.setattr(guard, "exact_merge_subject", lambda _: {
        "base": BASE, "candidate": CANDIDATE, "tree": TREE, "paths": [PATH]})
    try:
        assert guard.check_commit(RELEASE, client)["reason"] == "release_test_not_complete"
        client.complete()
        assert guard.check_commit(RELEASE, client)["proofAllowed"] is True
        monkeypatch.setattr(guard, "exact_merge_subject", lambda _: {
            "base": BASE, "candidate": CANDIDATE, "tree": "0" * 40, "paths": [PATH]})
        assert guard.check_commit(RELEASE, client)["reason"] == "release_merge_subject_changed"
    finally:
        client.sqlite.close()


def test_observe_logs_missing_link_and_enforce_denies(monkeypatch, capsys):
    client = LocalClient()
    try:
        monkeypatch.setenv("SHARED_TEST_RELEASE_GUARD", "observe")
        assert guard.guard(RELEASE, "staging", client)["proofAllowed"] is False
        assert '"mode": "observe"' in capsys.readouterr().out
        monkeypatch.setenv("SHARED_TEST_RELEASE_GUARD", "enforce")
        with pytest.raises(ValueError, match="release_link_missing"):
            guard.guard(RELEASE, "staging", client)
    finally:
        client.sqlite.close()


def test_range_checks_an_earlier_app_commit_even_when_head_is_docs(monkeypatch):
    client = LocalClient()
    client.seed()
    first, second = "1" * 40, "2" * 40
    commands = {
        ("rev-list", "--first-parent", "--reverse", f"{BASE}..{second}"): f"{first}\n{second}",
        ("rev-list", "--parents", "-n", "1", first): f"{first} {BASE}",
        ("rev-list", "--parents", "-n", "1", second): f"{second} {first}",
        ("diff", "--name-only", "--no-renames", BASE, first): PATH,
        ("diff", "--name-only", "--no-renames", first, second): "docs/readme.md",
    }
    monkeypatch.setattr(guard, "git", lambda *args: commands.get(args, ""))
    try:
        result = guard.check_range(BASE, second, client)
        assert result["proofAllowed"] is False
        assert result["reason"] == "release_link_missing"
        assert result["checkedCommits"][0]["releaseCommit"] == first
        assert result["checkedCommits"][1]["reason"] == "outside_test_roots"
    finally:
        client.sqlite.close()
