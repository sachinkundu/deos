"""The deployment pointer stays closed until a complete two-read manifest is saved."""

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
        saved = client.finish(work_id, manifest_id)
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
            client.finish(work_id, manifest_id)
        assert client.pointer()["state"] == "updating"
    finally:
        client.sqlite.close()
