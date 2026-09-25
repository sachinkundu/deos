"""Build and verify the fixed BettaView staging Worker from main."""

import json
import os
import urllib.request

from portal_release import (
    ACCOUNT,
    ROOT,
    NoRedirect,
    artifact_digest,
    check_ref,
    check_route_access,
    clean_checkout,
    run,
)
from shared_test_release_guard import guard as shared_test_release_guard
from shared_test_staging_pointer import StagingPointerClient, release_ids, run_with_heartbeat

WORKER = "deos-bettaview-portal-staging"
HOST = "bettaview-staging.voxdez.com"


def preflight(config):
    stage = config["env"]["staging"]
    expected = {
        "name": WORKER,
        "routes": [{"pattern": HOST, "custom_domain": True}],
        "workers_dev": False,
        "preview_urls": False,
        "services": [{"binding": "DEOS_PORTAL", "service": "deos-workflow-portal-staging"}],
        "version_metadata": {"binding": "CF_VERSION_METADATA"},
    }
    if config.get("account_id") != ACCOUNT or config.get("main") != "worker/index.js":
        raise ValueError("Unexpected BettaView account or entrypoint")
    if config.get("assets", {}).get("directory") != "./dist":
        raise ValueError("Unexpected BettaView build target")
    for key, value in expected.items():
        if stage.get(key) != value:
            raise ValueError(f"Unexpected BettaView staging {key}")
    if stage.get("vars", {}).get("BETTAVIEW_CANONICAL_HOST") != HOST:
        raise ValueError("Unexpected BettaView staging host variable")
    if stage.get("d1_databases") or stage.get("r2_buckets"):
        raise ValueError("BettaView staging cannot bind live data stores")


def deployment():
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{WORKER}/deployments",
        headers={"Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"]},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if payload.get("success") is not True:
        raise ValueError("BettaView staging deployment read failed")
    rows = payload.get("result", {}).get("deployments", [])
    if not rows:
        raise ValueError("BettaView staging has no deployment")
    return max(rows, key=lambda row: row["created_on"])


def host_version():
    request = urllib.request.Request(
        f"https://{HOST}/api/version",
        headers={"Accept": "application/json", "User-Agent": "DEOS-BettaView-Staging/1.0"},
    )
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
        return json.load(response)


def validate_readback(sha, build_digest, deployed, host):
    versions = deployed.get("versions", [])
    if len(versions) != 1 or versions[0].get("percentage") != 100:
        raise ValueError("BettaView staging does not have one version at full traffic")
    expected = {
        "canonicalHost": HOST,
        "sourceSha": sha,
        "buildInputSha256": build_digest,
        "versionId": versions[0]["version_id"],
    }
    if host != expected:
        raise ValueError("BettaView staging host differs from the deployed version")


def deploy():
    if not os.environ.get("CLOUDFLARE_API_TOKEN"):
        raise ValueError("Missing CLOUDFLARE_API_TOKEN")
    sha = clean_checkout()
    check_ref("staging", sha)
    shared_test_release_guard(sha, "bettaview-staging")
    preflight(json.loads((ROOT / "portal/bettaview/wrangler.jsonc").read_text()))
    check_route_access()
    run("npm", "ci", "--prefix", "portal/bettaview")
    run("npm", "run", "bettaview:build")
    run("npm", "--prefix", "portal/bettaview", "test")
    built = ROOT / "portal/bettaview/dist"
    digest = artifact_digest(sha, [ROOT / "portal/bettaview/worker/index.js",
                                   *(path for path in built.rglob("*") if path.is_file())])
    if clean_checkout() != sha:
        raise ValueError("BettaView build changed the source checkout")
    check_ref("staging", sha)
    pointer = StagingPointerClient()
    current = pointer.pointer()
    if current["state"] not in ("stable", "uninitialized"):
        raise ValueError("Staging release pointer is busy or blocked")
    if current["state"] == "stable":
        work_id, manifest_id = release_ids("bettaview", sha, digest)
        pointer.begin(work_id, manifest_id, "bettaview-staging-deploy")
    args = ("npx", "--no-install", "wrangler", "deploy", "--config",
            "portal/bettaview/wrangler.jsonc", "--env", "staging",
            "--var", f"BETTAVIEW_SOURCE_SHA:{sha}",
            "--var", f"BETTAVIEW_BUILD_INPUT_SHA256:{digest}")
    if current["state"] == "stable":
        run_with_heartbeat(args, ROOT, pointer, work_id)
    else:
        run(*args)
    deployed, host = deployment(), host_version()
    validate_readback(sha, digest, deployed, host)
    if current["state"] == "stable":
        pointer.finish(work_id, manifest_id)
    print(json.dumps({"deploymentId": deployed["id"], **host}, indent=2))


if __name__ == "__main__":
    deploy()
