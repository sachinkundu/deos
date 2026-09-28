"""Staging preserves only bytes that match its published build digest."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import portal_release
import shared_test_build_bundle
from publish_shared_test_candidate import verify


def test_bundle_matches_staging_digest_and_rejects_modified_bytes(tmp_path, monkeypatch):
    monkeypatch.setattr(portal_release, "ROOT", tmp_path)
    monkeypatch.setattr(shared_test_build_bundle, "ROOT", tmp_path)
    worker = tmp_path / "portal-worker/worker.js"
    asset = tmp_path / "portal/dist/index.html"
    migration = tmp_path / "migrations/0001_initial.sql"
    worker.parent.mkdir(parents=True)
    asset.parent.mkdir(parents=True)
    migration.parent.mkdir(parents=True)
    worker.write_text("export default {}")
    asset.write_text("<h1>test</h1>")
    migration.write_text("CREATE TABLE example (id TEXT);")
    sha = "a" * 40
    files = [worker, asset, migration]
    digest = portal_release.artifact_digest(sha, files)
    saved = json.loads(shared_test_build_bundle.bundle("portal", sha, files, digest))
    assert saved["serviceName"] == "portal"
    assert [item["path"] for item in saved["files"]] == [
        "migrations/0001_initial.sql", "portal/dist/index.html", "portal-worker/worker.js"
    ]
    asset.write_text("changed")
    with pytest.raises(ValueError, match="differ from staging digest"):
        shared_test_build_bundle.bundle("portal", sha, files, digest)


def test_publish_reads_back_the_exact_r2_object(tmp_path, monkeypatch):
    monkeypatch.setattr(portal_release, "ROOT", tmp_path)
    monkeypatch.setattr(shared_test_build_bundle, "ROOT", tmp_path)
    worker = tmp_path / "portal-worker/worker.js"
    asset = tmp_path / "portal/dist/index.html"
    migration = tmp_path / "migrations/0001_initial.sql"
    worker.parent.mkdir(parents=True)
    asset.parent.mkdir(parents=True)
    migration.parent.mkdir(parents=True)
    worker.write_text("export default {}")
    asset.write_text("ok")
    migration.write_text("CREATE TABLE example (id TEXT);")
    sha = "b" * 40
    files = [worker, asset, migration]
    digest = portal_release.artifact_digest(sha, files)
    uploaded = None

    def fake_run(*args):
        nonlocal uploaded
        if "put" in args:
            uploaded = Path(args[args.index("--file") + 1]).read_bytes()
        elif "get" in args:
            Path(args[args.index("--file") + 1]).write_bytes(uploaded)
        else:
            raise AssertionError(args)

    monkeypatch.setattr(shared_test_build_bundle, "run", fake_run)
    key = shared_test_build_bundle.publish("portal", sha, files, digest)
    assert key == f"shared-test/builds/portal/{sha}/{digest}.json"
    assert uploaded is not None


def test_bettaview_bundle_includes_imported_worker_modules(tmp_path, monkeypatch):
    monkeypatch.setattr(portal_release, "ROOT", tmp_path)
    monkeypatch.setattr(shared_test_build_bundle, "ROOT", tmp_path)
    index = tmp_path / "portal/bettaview/worker/index.js"
    sibling = tmp_path / "portal/bettaview/worker/access.js"
    asset = tmp_path / "portal/bettaview/dist/index.html"
    index.parent.mkdir(parents=True)
    asset.parent.mkdir(parents=True)
    index.write_text('import "./access.js"; export default {};')
    sibling.write_text("export const access = true;")
    asset.write_text("<html></html>")
    files = [index, sibling, asset]
    sha = "c" * 40
    digest = portal_release.artifact_digest(sha, files)
    saved = json.loads(shared_test_build_bundle.bundle("bettaview", sha, files, digest))
    assert {item["path"] for item in saved["files"]} == {
        "portal/bettaview/worker/index.js", "portal/bettaview/worker/access.js",
        "portal/bettaview/dist/index.html",
    }


def test_candidate_upload_checks_bytes_before_using_credential(tmp_path):
    worker = tmp_path / "portal-worker/worker.js"
    asset = tmp_path / "portal/dist/index.html"
    migration = tmp_path / "migrations/0001_initial.sql"
    for path, content in ((worker, "export default {}"), (asset, "ok"),
                          (migration, "CREATE TABLE example (id TEXT);")):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    commit = "d" * 40
    files = [worker, asset, migration]
    digest = shared_test_build_bundle.artifact_digest(commit, files, tmp_path)
    raw = shared_test_build_bundle.bundle("portal", commit, files, digest, tmp_path)
    receipt = {"serviceName": "portal", "candidateCommit": commit,
               "buildInputSha256": digest, "bytes": len(raw)}
    assert verify(raw, receipt) == ("portal", commit, digest)
    changed = raw.replace(b"b2s=", b"YmFk")
    with pytest.raises(ValueError, match="digest differs"):
        verify(changed, receipt)
