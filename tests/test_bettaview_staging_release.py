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
