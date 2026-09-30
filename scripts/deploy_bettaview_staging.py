"""Build and verify the fixed BettaView staging Worker from main."""

import json
import os
import re
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
from shared_test_build_bundle import publish as publish_test_build
from shared_test_release_guard import guard as shared_test_release_guard
from shared_test_worker_module import build as build_test_worker_module
from shared_test_worker_module import publish as publish_test_worker_module

WORKER = "deos-bettaview-portal-staging"
HOST = "bettaview-staging.voxdez.com"


def preflight(config):
    stage = config["env"]["staging"]
    expected = {
        "name": WORKER,
        "routes": [{"pattern": HOST, "custom_domain": True}],
        "workers_dev": False,
        "preview_urls": False,
        "services": [
            {"binding": "DEOS_REVIEW_CONTINUATION", "service": "deos-queue-consumer-ts",
             "entrypoint": "ReviewContinuation"},
            {"binding": "DEOS_PORTAL", "service": "deos-workflow-portal-staging"},
        ],
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


def host_version():
    request = urllib.request.Request(
        f"https://{HOST}/api/version",
        headers={"Accept": "application/json", "User-Agent": "DEOS-BettaView-Staging/1.0",
                 "CF-Access-Client-Id": os.environ["PORTAL_ACCESS_CLIENT_ID"],
                 "CF-Access-Client-Secret": os.environ["PORTAL_ACCESS_CLIENT_SECRET"]},
    )
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
        return json.load(response)


def validate_readback(sha, build_digest, host):
    if re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}",
                    host.get("versionId", "")) is None:
        raise ValueError("BettaView staging version response is invalid")
    expected = {
        "canonicalHost": HOST,
        "sourceSha": sha,
        "buildInputSha256": build_digest,
        "versionId": host["versionId"],
    }
    if host != expected:
        raise ValueError("BettaView staging host differs from the selected build")


def deploy():
    for name in ("CLOUDFLARE_API_TOKEN", "PORTAL_ACCESS_CLIENT_ID", "PORTAL_ACCESS_CLIENT_SECRET"):
        if not os.environ.get(name):
            raise ValueError(f"Missing {name}")
    sha = clean_checkout()
    check_ref("staging", sha)
    shared_test_release_guard(sha, "bettaview-staging",
                              base_loader=lambda: host_version()["sourceSha"])
    preflight(json.loads((ROOT / "portal/bettaview/wrangler.jsonc").read_text()))
    check_route_access()
    run("npm", "ci")
    run("npm", "ci", "--prefix", "portal/bettaview")
    run("npm", "run", "bettaview:build")
    run("npm", "--prefix", "portal/bettaview", "test")
    built = ROOT / "portal/bettaview/dist"
    build_files = [*sorted((ROOT / "portal/bettaview/worker").glob("*.js")),
                   *(path for path in built.rglob("*") if path.is_file())]
    digest = artifact_digest(sha, build_files)
    if clean_checkout() != sha:
        raise ValueError("BettaView build changed the source checkout")
    check_ref("staging", sha)
    publish_test_build("bettaview", sha, build_files, digest)
    module, receipt = build_test_worker_module(ROOT, sha, digest)
    publish_test_worker_module(module, receipt)
    args = ("npx", "--no-install", "wrangler", "deploy", "--config",
            "portal/bettaview/wrangler.jsonc", "--env", "staging",
            "--var", f"BETTAVIEW_SOURCE_SHA:{sha}",
            "--var", f"BETTAVIEW_BUILD_INPUT_SHA256:{digest}")
    run(*args)
    host = host_version()
    validate_readback(sha, digest, host)
    print(json.dumps(host, indent=2))


if __name__ == "__main__":
    deploy()
