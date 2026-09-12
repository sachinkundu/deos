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
    monkeypatch.setattr(release, "check_route_access", lambda: None)


def test_missing_route_permission_stops_before_build_or_upload(monkeypatch):
    setup_deploy(monkeypatch)
    calls = []

    def denied():
        raise ValueError("Cannot read voxdez.com Worker routes; check Workers Routes Read")

    monkeypatch.setattr(release, "check_route_access", denied)
    monkeypatch.setattr(release, "run", lambda *args, **kwargs: calls.append(args))
    with pytest.raises(ValueError, match="Workers Routes Read"):
        release.deploy("staging")
    assert calls == []


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
        if "wrangler" in args and "--dry-run" not in args:
            raise subprocess.CalledProcessError(1, args)

    monkeypatch.setattr(release, "run", run)
    observed = []
    monkeypatch.setattr(release, "provider_deployment", lambda target: observed.append(target))
    monkeypatch.setattr(release, "host_version", lambda target: {})
    with pytest.raises(subprocess.CalledProcessError):
        release.deploy("staging")
    deploys = [args for args in calls if "wrangler" in args and "--dry-run" not in args]
    assert len(deploys) == 1
    assert deploys[0][-4:] == ("--env", "staging", "--var", f"PORTAL_SOURCE_SHA:{SHA}")
    assert observed == ["staging"]


def test_production_rejects_manual_local_deploy(monkeypatch):
    setup_deploy(monkeypatch)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    with pytest.raises(ValueError, match="manual release workflow"):
        release.deploy("production")


def test_failed_hostname_read_keeps_uploaded_version_evidence(monkeypatch, capsys):
    setup_deploy(monkeypatch)
    calls = []

    def run(*args, **kwargs):
        calls.append(args)
        if "wrangler" in args and "--dry-run" not in args:
            raise subprocess.CalledProcessError(1, args)

    def unreachable(target):
        raise OSError("Hostname has no DNS record")

    monkeypatch.setattr(release, "run", run)
    monkeypatch.setattr(release, "provider_deployment", lambda target: {"id": "uploaded-version"})
    monkeypatch.setattr(release, "host_version", unreachable)
    with pytest.raises(subprocess.CalledProcessError):
        release.deploy("staging")
    assert json.loads(capsys.readouterr().out) == {
        "observedDeployment": {"id": "uploaded-version"},
        "observedHostError": "OSError",
    }
    assert len([args for args in calls if "wrangler" in args and "--dry-run" not in args]) == 1


def test_promotion_rejects_non_sha_input_before_git(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    monkeypatch.setenv("GITHUB_REF", "refs/heads/main")
    monkeypatch.setenv("REVIEWED_SHA", "main; echo bad")
    with pytest.raises(ValueError, match="full reviewed commit SHA"):
        release.promote()


def test_real_git_promotion_retry_dirty_checkout_and_rewind(tmp_path, monkeypatch):
    monkeypatch.setattr(release, "checked_artifact", lambda sha: tmp_path)
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


def test_checked_artifact_rejects_missing_failed_and_different_revision(tmp_path, monkeypatch):
    monkeypatch.delenv("CHECKED_PORTAL_ARTIFACT", raising=False)
    with pytest.raises(ValueError, match="same-run"):
        release.checked_artifact(SHA)
    monkeypatch.setenv("CHECKED_PORTAL_ARTIFACT", str(tmp_path))
    (tmp_path / "portal-proof").mkdir()
    (tmp_path / "portal/dist").mkdir(parents=True)
    (tmp_path / "portal/dist/index.html").write_text("checked assets")
    (tmp_path / "portal-worker").mkdir()
    (tmp_path / "portal-worker/worker.js").write_text("checked worker")
    proof = tmp_path / "portal-proof/check.json"
    for value in ({"sourceSha": "b" * 40, "passed": True}, {"sourceSha": SHA, "passed": False}):
        proof.write_text(json.dumps(value))
        with pytest.raises(ValueError, match="Staging sidebar"):
            release.checked_artifact(SHA)
    proof.write_text(json.dumps({"sourceSha": SHA, "passed": True}))
    assert release.checked_artifact(SHA) == tmp_path / "portal/dist"


def test_production_job_requires_staging_and_downloads_only_its_artifact():
    workflow = (release.ROOT / ".github/workflows/portal-release.yml").read_text()
    assert "needs: portal-staging" in workflow
    assert "node scripts/check-portal-recent-issues.mjs" in workflow
    assert "actions/download-artifact@v4" in workflow
    assert "run-id:" not in workflow
    assert "environment: production" in workflow


def test_production_uses_checked_worker_and_assets_without_rebuilding(tmp_path, monkeypatch):
    setup_deploy(monkeypatch)
    monkeypatch.setattr(release, "ROOT", tmp_path)
    (tmp_path / "portal").mkdir()
    (tmp_path / "portal/wrangler.jsonc").write_text(json.dumps(CONFIG))
    artifact = tmp_path / "artifact"
    (artifact / "portal/dist").mkdir(parents=True)
    (artifact / "portal/dist/index.html").write_text("checked frontend")
    (artifact / "portal-worker").mkdir()
    (artifact / "portal-worker/worker.js").write_text("checked worker")
    (artifact / "portal-proof").mkdir()
    (artifact / "portal-proof/check.json").write_text(json.dumps({"sourceSha": SHA, "passed": True}))
    for name, value in {
        "GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REF": "refs/heads/main", "REVIEWED_SHA": SHA,
        "CHECKED_PORTAL_ARTIFACT": str(artifact),
    }.items():
        monkeypatch.setenv(name, value)
    calls = []
    monkeypatch.setattr(release, "run", lambda *args: calls.append(args))
    monkeypatch.setattr(release, "provider_deployment", lambda target: {"id": "deployment"})
    monkeypatch.setattr(release, "host_version", lambda target: {})
    monkeypatch.setattr(release, "validate_readback", lambda *args: None)
    release.deploy("production")
    assert (tmp_path / "portal/dist/index.html").read_text() == "checked frontend"
    assert not any("portal:build" in args or "esbuild" in args for args in calls)
    deploy = next(args for args in calls if "wrangler" in args)
    assert str(artifact / "portal-worker/worker.js") in deploy
    assert "--no-bundle" in deploy
