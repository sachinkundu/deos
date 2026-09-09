"""Release safety checks without provider credentials or deployment effects."""

import copy
import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "portal_release", Path(__file__).resolve().parents[1] / "scripts/portal_release.py"
)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
CONFIG = json.loads((release.ROOT / "portal/wrangler.jsonc").read_text())
SHA = "a" * 40


@pytest.mark.parametrize("target", ["staging", "production"])
def test_fixed_config_and_shared_resources(target):
    release.preflight(CONFIG, target)


@pytest.mark.parametrize(
    "key,value",
    [
        ("name", "deos-workflow-portal"),
        ("routes", [{"pattern": "deos.voxdez.com", "custom_domain": True}]),
        ("d1_databases", []),
        ("r2_buckets", []),
        ("services", []),
        ("account_id", "another-account"),
        ("workers_dev", True),
        ("assets", {"directory": "elsewhere"}),
    ],
)
def test_staging_rejects_changed_resource_tuple(key, value):
    config = copy.deepcopy(CONFIG)
    config["env"]["staging"][key] = value
    with pytest.raises(ValueError):
        release.preflight(config, "staging")


def test_readback_requires_same_sha_site_host_and_single_active_version():
    deployment = {"versions": [{"version_id": "v1", "percentage": 100}]}
    version = {
        "site": "Staging",
        "canonicalHost": "deos-staging.voxdez.com",
        "sourceBranch": "main",
        "sourceSha": SHA,
        "versionId": "v1",
    }
    release.validate_readback("staging", SHA, deployment, version)
    for key in version:
        with pytest.raises(ValueError):
            release.validate_readback("staging", SHA, deployment, {**version, key: "wrong"})
    with pytest.raises(ValueError):
        release.validate_readback(
            "staging",
            SHA,
            {
                "versions": [
                    {"version_id": "v1", "percentage": 50},
                    {"version_id": "v2", "percentage": 50},
                ]
            },
            version,
        )


def setup_deploy(monkeypatch):
    for name in ["CLOUDFLARE_API_TOKEN", "PORTAL_ACCESS_CLIENT_ID", "PORTAL_ACCESS_CLIENT_SECRET"]:
        monkeypatch.setenv(name, "test")
    monkeypatch.setattr(release, "clean_checkout", lambda: SHA)
    monkeypatch.setattr(release, "check_ref", lambda *args: None)


def test_failed_build_never_calls_wrangler(monkeypatch):
    setup_deploy(monkeypatch)
    calls = []

    def run(*args, **kwargs):
        calls.append(args)
        if "portal:build" in args:
            raise subprocess.CalledProcessError(1, args)

    monkeypatch.setattr(release, "run", run)
    with pytest.raises(subprocess.CalledProcessError):
        release.deploy("staging")
    assert not any("wrangler" in args for args in calls)


def test_failed_wrangler_reads_back_once_without_retry(monkeypatch):
    setup_deploy(monkeypatch)
    calls = []

    def run(*args, **kwargs):
        calls.append(args)
        if "wrangler" in args:
            raise subprocess.CalledProcessError(1, args)

    monkeypatch.setattr(release, "run", run)
    observed = []
    monkeypatch.setattr(release, "provider_deployment", lambda target: observed.append(target))
    monkeypatch.setattr(release, "host_version", lambda target: {})
    with pytest.raises(subprocess.CalledProcessError):
        release.deploy("staging")
    deploys = [args for args in calls if "wrangler" in args]
    assert len(deploys) == 1
    assert deploys[0][-4:] == ("--env", "staging", "--var", f"PORTAL_SOURCE_SHA:{SHA}")
    assert observed == ["staging"]


def test_production_rejects_manual_local_deploy(monkeypatch):
    setup_deploy(monkeypatch)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    with pytest.raises(ValueError, match="manual release workflow"):
        release.deploy("production")


def test_promotion_rejects_non_sha_input_before_git(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    monkeypatch.setenv("GITHUB_REF", "refs/heads/main")
    monkeypatch.setenv("REVIEWED_SHA", "main; echo bad")
    with pytest.raises(ValueError, match="full reviewed commit SHA"):
        release.promote()


def test_real_git_promotion_retry_dirty_checkout_and_rewind(tmp_path, monkeypatch):
    remote = tmp_path / "remote.git"
    checkout = tmp_path / "checkout"

    def git(*args, cwd=tmp_path):
        return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()

    git("init", "--bare", str(remote))
    git("clone", str(remote), str(checkout))
    git("config", "user.email", "test@example.com", cwd=checkout)
    git("config", "user.name", "Test", cwd=checkout)
    git("checkout", "-b", "main", cwd=checkout)
    git("commit", "--allow-empty", "-m", "baseline", cwd=checkout)
    baseline = git("rev-parse", "HEAD", cwd=checkout)
    git("push", "origin", "main", "HEAD:release", cwd=checkout)
    git("commit", "--allow-empty", "-m", "candidate", cwd=checkout)
    candidate = git("rev-parse", "HEAD", cwd=checkout)
    git("push", "origin", "main", cwd=checkout)
    monkeypatch.setattr(release, "ROOT", checkout)
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    monkeypatch.setenv("GITHUB_REF", "refs/heads/main")
    monkeypatch.setenv("REVIEWED_SHA", candidate)
    assert release.promote() == candidate
    assert git("rev-parse", "HEAD", cwd=checkout) == candidate
    assert release.promote() == candidate  # Same-release retry is idempotent.
    release.check_ref("production", candidate)
    with pytest.raises(ValueError, match="current release head"):
        release.check_ref("production", baseline)
    monkeypatch.setenv("REVIEWED_SHA", baseline)
    with pytest.raises(subprocess.CalledProcessError):
        release.promote()
    assert git("rev-parse", "refs/heads/release", cwd=remote) == candidate
    (checkout / "untracked.txt").write_text("not committed")
    with pytest.raises(ValueError, match="clean checkout"):
        release.clean_checkout()
