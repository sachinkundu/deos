"""Staging preserves only bytes that match its published build digest."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import portal_release
import shared_test_build_bundle


def test_bundle_matches_staging_digest_and_rejects_modified_bytes(tmp_path, monkeypatch):
    monkeypatch.setattr(portal_release, "ROOT", tmp_path)
    monkeypatch.setattr(shared_test_build_bundle, "ROOT", tmp_path)
    worker = tmp_path / "portal-worker/worker.js"
    asset = tmp_path / "portal/dist/index.html"
    worker.parent.mkdir(parents=True)
    asset.parent.mkdir(parents=True)
    worker.write_text("export default {}")
    asset.write_text("<h1>test</h1>")
    sha = "a" * 40
    digest = portal_release.artifact_digest(sha, [worker, asset])
    saved = json.loads(shared_test_build_bundle.bundle("portal", sha, [asset, worker], digest))
    assert saved["serviceName"] == "portal"
    assert [item["path"] for item in saved["files"]] == [
        "portal/dist/index.html", "portal-worker/worker.js"
    ]
    asset.write_text("changed")
    with pytest.raises(ValueError, match="differ from staging digest"):
        shared_test_build_bundle.bundle("portal", sha, [worker, asset], digest)


def test_publish_reads_back_the_exact_r2_object(tmp_path, monkeypatch):
    monkeypatch.setattr(portal_release, "ROOT", tmp_path)
    monkeypatch.setattr(shared_test_build_bundle, "ROOT", tmp_path)
    worker = tmp_path / "portal-worker/worker.js"
    asset = tmp_path / "portal/dist/index.html"
    worker.parent.mkdir(parents=True)
    asset.parent.mkdir(parents=True)
    worker.write_text("export default {}")
    asset.write_text("ok")
    sha = "b" * 40
    digest = portal_release.artifact_digest(sha, [worker, asset])
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
    key = shared_test_build_bundle.publish("portal", sha, [worker, asset], digest)
    assert key == f"shared-test/builds/portal/{sha}/{digest}.json"
    assert uploaded is not None
