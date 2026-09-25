"""BettaView staging can only target its isolated Worker and service binding."""

import copy
import importlib.util
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

SPEC = importlib.util.spec_from_file_location(
    "deploy_bettaview_staging",
    Path(__file__).resolve().parents[1] / "scripts/deploy_bettaview_staging.py",
)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
CONFIG = json.loads((release.ROOT / "portal/bettaview/wrangler.jsonc").read_text())


def test_fixed_staging_binding_and_host():
    release.preflight(CONFIG)


@pytest.mark.parametrize("key,value", [
    ("name", "deos-bettaview-portal"),
    ("routes", [{"pattern": "bettaview.voxdez.com", "custom_domain": True}]),
    ("services", [{"binding": "DEOS_PORTAL", "service": "deos-workflow-portal"}]),
    ("d1_databases", [{"binding": "DB", "database_id": "live"}]),
    ("r2_buckets", [{"binding": "ARTIFACTS", "bucket_name": "live"}]),
])
def test_wrong_stage_target_rejected(key, value):
    config = copy.deepcopy(CONFIG)
    config["env"]["staging"][key] = value
    with pytest.raises(ValueError):
        release.preflight(config)


def test_host_must_match_exact_full_traffic_version():
    sha, digest = "a" * 40, "b" * 64
    deployed = {"versions": [{"version_id": "v1", "percentage": 100}]}
    host = {"canonicalHost": release.HOST, "sourceSha": sha,
            "buildInputSha256": digest, "versionId": "v1"}
    release.validate_readback(sha, digest, deployed, host)
    with pytest.raises(ValueError):
        release.validate_readback(sha, digest, deployed, {**host, "versionId": "other"})
    with pytest.raises(ValueError):
        release.validate_readback(sha, digest,
                                  {"versions": [{"version_id": "v1", "percentage": 90}]}, host)


def test_active_attempt_stops_bettaview_before_wrangler(monkeypatch):
    for name in ("CLOUDFLARE_API_TOKEN", "PORTAL_ACCESS_CLIENT_ID",
                 "PORTAL_ACCESS_CLIENT_SECRET"):
        monkeypatch.setenv(name, "test")
    monkeypatch.setattr(release, "clean_checkout", lambda: "a" * 40)
    monkeypatch.setattr(release, "check_ref", lambda *args: None)
    monkeypatch.setattr(release, "shared_test_release_guard", lambda *args, **kwargs: None)
    monkeypatch.setattr(release, "check_route_access", lambda: None)
    monkeypatch.setattr(release, "artifact_digest", lambda *args: "b" * 64)
    calls = []
    monkeypatch.setattr(release, "run", lambda *args, **kwargs: calls.append(args))

    class BusyPointer:
        def prepare_deploy(self, target, sha, build_digest, owner):
            return {"action": "deploy", "tracked": False}

        def assert_no_active_attempts(self):
            raise ValueError("Staging deploy requires a stopped agent gate")

    monkeypatch.setattr(release, "StagingPointerClient", BusyPointer)
    with pytest.raises(ValueError, match="stopped agent gate"):
        release.deploy()
    assert not any("wrangler" in args for args in calls)


def test_staging_workflows_share_one_deploy_mutex():
    root = Path(__file__).resolve().parents[1]
    for filename in ("bettaview-staging.yml", "portal-staging.yml"):
        workflow = (root / ".github/workflows" / filename).read_text()
        assert "group: shared-staging-deploy" in workflow
