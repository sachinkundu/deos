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


@pytest.fixture(autouse=True)
def no_remote_guard(monkeypatch):
    monkeypatch.setattr(release, "shared_test_release_guard", lambda *args: None)


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
        "buildInputSha256": "b" * 64,
        "versionId": "v1",
    }
    release.validate_readback("staging", SHA, deployment, version, "b" * 64)
    for key in version:
        with pytest.raises(ValueError):
            release.validate_readback("staging", SHA, deployment, {**version, key: "wrong"}, "b" * 64)
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
            "b" * 64,
        )


def test_build_input_digest_changes_with_bytes_and_source(tmp_path, monkeypatch):
    monkeypatch.setattr(release, "ROOT", tmp_path)
    first = tmp_path / "portal-worker.js"
    first.write_bytes(b"bundle-one")
    original = release.artifact_digest(SHA, [first])
    first.write_bytes(b"bundle-two")
    assert release.artifact_digest(SHA, [first]) != original
    assert release.artifact_digest("b" * 40, [first]) != original


def setup_deploy(monkeypatch):
    for name in ["CLOUDFLARE_API_TOKEN", "PORTAL_ACCESS_CLIENT_ID", "PORTAL_ACCESS_CLIENT_SECRET"]:
        monkeypatch.setenv(name, "test")
    monkeypatch.setattr(release, "clean_checkout", lambda: SHA)
    monkeypatch.setattr(release, "check_ref", lambda *args: None)
    monkeypatch.setattr(release, "check_route_access", lambda: None)
    monkeypatch.setattr(release, "artifact_digest", lambda *args: "b" * 64)
    class UninitializedPointer:
        def pointer(self):
            return {"state": "uninitialized"}
    monkeypatch.setattr(release, "StagingPointerClient", UninitializedPointer)


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
    assert deploys[0][-6:] == (
        "--env", "staging", "--var", f"PORTAL_SOURCE_SHA:{SHA}",
        "--var", "PORTAL_BUILD_INPUT_SHA256:" + "b" * 64,
    )
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
    git("checkout", "--detach", baseline, cwd=checkout)
    with pytest.raises(subprocess.CalledProcessError):
        release.promote()
    assert git("rev-parse", "refs/heads/release", cwd=remote) == candidate
    (checkout / "untracked.txt").write_text("not committed")
    with pytest.raises(ValueError, match="clean checkout"):
        release.clean_checkout()


def test_promotion_rejects_checkout_other_than_approved_sha(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    monkeypatch.setenv("GITHUB_REF", "refs/heads/main")
    monkeypatch.setenv("REVIEWED_SHA", SHA)
    monkeypatch.setattr(release, "clean_checkout", lambda: "b" * 40)
    calls = []
    monkeypatch.setattr(release, "run", lambda *args: calls.append(args))
    with pytest.raises(ValueError, match="Promotion checkout differs"):
        release.promote()
    assert calls == []


def test_production_workflow_uses_owner_approval_without_reviewer_credentials():
    workflow = (release.ROOT / ".github/workflows/portal-release.yml").read_text()
    assert "workflow_dispatch:" in workflow
    assert "ref: ${{ inputs.reviewed_sha }}" in workflow
    assert "environment: production" in workflow
    assert "python scripts/release_portal.py" in workflow
    assert "portal-staging:" not in workflow
    assert "PORTAL_REVIEWER_ACCESS" not in workflow
    assert "actions/download-artifact" not in workflow
    assert "check-portal-recent-issues" not in workflow


def test_production_builds_and_deploys_the_promoted_checkout(tmp_path, monkeypatch):
    setup_deploy(monkeypatch)
    monkeypatch.setattr(release, "ROOT", tmp_path)
    (tmp_path / "portal").mkdir()
    (tmp_path / "portal/wrangler.jsonc").write_text(json.dumps(CONFIG))
    for name, value in {
        "GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REF": "refs/heads/main", "REVIEWED_SHA": SHA,
    }.items():
        monkeypatch.setenv(name, value)
    calls = []
    monkeypatch.setattr(release, "run", lambda *args: calls.append(args))
    monkeypatch.setattr(release, "provider_deployment", lambda target: {"id": "deployment"})
    monkeypatch.setattr(release, "host_version", lambda target: {})
    monkeypatch.setattr(release, "validate_readback", lambda *args: None)
    release.deploy("production")
    build = next(args for args in calls if "portal:build" in args)
    bundle = next(args for args in calls if "esbuild" in args)
    deploy = next(args for args in calls if "wrangler" in args)
    assert calls.index(build) < calls.index(bundle) < calls.index(deploy)
    assert str(tmp_path / "portal-worker/worker.js") in deploy
    assert "--no-bundle" in deploy
    assert "--env" not in deploy
    assert deploy[-4:] == (
        "--var", f"PORTAL_SOURCE_SHA:{SHA}",
        "--var", "PORTAL_BUILD_INPUT_SHA256:" + "b" * 64,
    )


def test_production_rejects_unapproved_checkout_before_build(monkeypatch):
    setup_deploy(monkeypatch)
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    monkeypatch.setenv("GITHUB_REF", "refs/heads/main")
    monkeypatch.setenv("REVIEWED_SHA", "b" * 40)
    calls = []
    monkeypatch.setattr(release, "run", lambda *args: calls.append(args))
    with pytest.raises(ValueError, match="Production checkout differs"):
        release.deploy("production")
    assert calls == []
