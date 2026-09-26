"""The deployment pointer stays closed until a complete two-read manifest is saved."""

import io
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from shared_test_staging_pointer import StagingPointerClient, release_ids


class LocalPointer(StagingPointerClient):
    def __init__(self, reads):
        self.sqlite = sqlite3.connect(":memory:", isolation_level=None)
        self.sqlite.row_factory = sqlite3.Row
        self.sqlite.executescript((ROOT / "migrations/0055_shared_test_environment.sql").read_text())
        self.sqlite.execute("""CREATE TABLE agent_attempts (
            attempt_id TEXT,run_id TEXT,node_id TEXT,state TEXT,created_at TEXT)""")
        self.reads = iter(reads)

    def query(self, sql, params=()):
        cursor = self.sqlite.execute(sql, params)
        return {"results": [dict(row) for row in cursor.fetchall()] if cursor.description else [],
                "meta": {"changes": cursor.rowcount}}

    def traffic(self):
        return next(self.reads)


def traffic(revision="traffic-one"):
    return {"revision": revision, "services": [
        {"serviceName": "bettaview", "sourceCommit": "a" * 40,
         "deployVersion": "version-a", "buildInputSha256": "b" * 64,
         "appPaths": ["portal/bettaview/"], "providerPaths": [], "deploymentId": "deployment-a"},
        {"serviceName": "portal", "sourceCommit": "c" * 40,
         "deployVersion": "version-b", "buildInputSha256": "d" * 64,
         "appPaths": ["portal/"], "providerPaths": ["src/deos/"],
         "deploymentId": "deployment-b"},
    ]}


def test_bootstrap_saves_full_manifest_before_stable_pointer():
    client = LocalPointer([traffic(), traffic()])
    try:
        work_id, manifest_id = release_ids("bootstrap", "a" * 40, "b" * 64)
        client.begin(work_id, manifest_id, "test")
        assert client.pointer()["state"] == "updating"
        saved = client.finish(work_id, manifest_id, "test")
        assert saved["state"] == "stable"
        assert saved["traffic_revision"] == "traffic-one"
        assert client.query("SELECT COUNT(*) AS count FROM staging_release_services")["results"][0]["count"] == 2
    finally:
        client.sqlite.close()


def test_changed_traffic_leaves_pointer_updating_and_blocks_grant():
    client = LocalPointer([traffic(), traffic("traffic-two")])
    try:
        work_id, manifest_id = release_ids("portal", "a" * 40, "b" * 64)
        client.begin(work_id, manifest_id, "test")
        with pytest.raises(ValueError, match="changed between readbacks"):
            client.finish(work_id, manifest_id, "test")
        assert client.pointer()["state"] == "updating"
    finally:
        client.sqlite.close()


def test_interrupted_deploy_reclaims_expired_same_work_and_fences_old_owner():
    client = LocalPointer([traffic(), traffic()])
    try:
        work_id, manifest_id = release_ids("portal", "a" * 40, "b" * 64, 0)
        client.begin(work_id, manifest_id, "old-owner")
        with pytest.raises(ValueError, match="live owner"):
            client.prepare_deploy("portal", "a" * 40, "b" * 64, "new-owner")
        client.sqlite.execute("UPDATE staging_release_pointer SET heartbeat_due_at='2000-01-01'")
        plan = client.prepare_deploy("portal", "a" * 40, "b" * 64, "new-owner")
        assert plan == {"action": "deploy", "tracked": True,
                        "work_id": work_id, "manifest_id": manifest_id}
        assert client.pointer()["owner"] == "new-owner"
        with pytest.raises(ValueError, match="fenced"):
            client.heartbeat(work_id, "old-owner")
        with pytest.raises(ValueError, match="different build inputs"):
            client.matching_work(client.pointer(), "portal", "a" * 40, "c" * 64)
    finally:
        client.sqlite.close()


def test_interrupted_manifest_commit_resumes_without_another_deploy():
    current = traffic()
    client = LocalPointer([current, current, current, current])
    try:
        work_id, manifest_id = release_ids("portal", "c" * 40, "d" * 64, 0)
        client.begin(work_id, manifest_id, "old-owner")
        original_query = client.query

        def interrupted(sql, params=()):
            if "UPDATE staging_release_pointer SET state='stable'" in sql:
                raise OSError("D1 connection lost after manifest save")
            return original_query(sql, params)

        client.query = interrupted
        with pytest.raises(OSError, match="connection lost"):
            client.finish(work_id, manifest_id, "old-owner")
        client.query = original_query
        client.sqlite.execute("UPDATE staging_release_pointer SET heartbeat_due_at='2000-01-01'")
        plan = client.prepare_deploy("portal", "c" * 40, "d" * 64, "new-owner")
        assert plan == {"action": "recovered", "tracked": False}
        assert client.pointer()["state"] == "stable"
        assert client.pointer()["manifest_id"] == manifest_id
    finally:
        client.sqlite.close()


def test_lost_deploy_reply_uses_live_target_before_redeploy():
    current = traffic()
    client = LocalPointer([current, current, current, current])
    try:
        work_id, manifest_id = release_ids("portal", "c" * 40, "d" * 64, 0)
        client.begin(work_id, manifest_id, "old-owner")
        client.sqlite.execute("UPDATE staging_release_pointer SET heartbeat_due_at='2000-01-01'")
        plan = client.prepare_deploy("portal", "c" * 40, "d" * 64, "new-owner")
        assert plan == {"action": "recovered", "tracked": False}
        assert client.pointer()["state"] == "stable"
        assert client.pointer()["manifest_id"] == manifest_id
    finally:
        client.sqlite.close()


def test_failed_provider_read_is_logged_and_same_work_can_retry(capsys):
    client = LocalPointer([])
    try:
        work_id, manifest_id = release_ids("portal", "c" * 40, "d" * 64, 0)
        client.begin(work_id, manifest_id, "old-owner")
        client.sqlite.execute("UPDATE staging_release_pointer SET heartbeat_due_at='2000-01-01'")

        def unavailable(*args):
            raise OSError("original host read failed")

        client.target_running = unavailable
        plan = client.prepare_deploy("portal", "c" * 40, "d" * 64, "new-owner")
        assert plan == {"action": "deploy", "tracked": True,
                        "work_id": work_id, "manifest_id": manifest_id}
        assert "original host read failed" in capsys.readouterr().err
        assert client.pointer()["state"] == "updating"
    finally:
        client.sqlite.close()


def test_recorded_same_build_is_noop_and_next_release_gets_new_id():
    current = traffic()
    client = LocalPointer([current, current, current, current])
    try:
        first_work, first_manifest = release_ids("portal", "c" * 40, "d" * 64, 0)
        client.begin(first_work, first_manifest, "first-owner")
        client.finish(first_work, first_manifest, "first-owner")
        assert client.prepare_deploy("portal", "c" * 40, "d" * 64,
                                     "second-owner") == {"action": "noop", "tracked": False}
        next_plan = client.prepare_deploy("portal", "c" * 40, "e" * 64, "next-owner")
        assert next_plan["action"] == "deploy"
        assert next_plan["manifest_id"] != first_manifest
    finally:
        client.sqlite.close()


def test_active_attempts_block_staging_deploy():
    client = LocalPointer([])
    try:
        client.assert_no_active_attempts()
        client.sqlite.execute("INSERT INTO agent_attempts VALUES (?,?,?,?,?)",
                              ("attempt-1", "run-1", "implementation", "running", "now"))
        with pytest.raises(ValueError, match="attempt-1"):
            client.assert_no_active_attempts()
    finally:
        client.sqlite.close()


def test_private_staging_version_read_uses_access_service_identity(monkeypatch):
    monkeypatch.setenv("PORTAL_ACCESS_CLIENT_ID", "test-client")
    monkeypatch.setenv("PORTAL_ACCESS_CLIENT_SECRET", "test-secret")

    class Opener:
        def open(self, request, timeout):
            assert timeout == 30
            assert request.get_header("Cf-access-client-id") == "test-client"
            assert request.get_header("Cf-access-client-secret") == "test-secret"
            assert request.get_header("Authorization") is None
            return io.BytesIO(b'{"sourceSha":"' + b"a" * 40 + b'"}')

    client = StagingPointerClient(token="cloudflare-token", opener=Opener())
    assert client._host({"host": "deos-staging.voxdez.com"})["sourceSha"] == "a" * 40
