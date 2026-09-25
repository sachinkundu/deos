"""Fixed portal deployment commands. No caller-supplied targets or resources."""

import hashlib
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

from shared_test_release_guard import guard as shared_test_release_guard
from shared_test_staging_pointer import StagingPointerClient, release_ids, run_with_heartbeat

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = "c68856288112af7698f5be52ea94b96e"
ZONE = "8a120356c46d1557fbf7fec6cbed7a19"
DATABASE = "4e854f8a-018a-42c4-a325-c4b8805c06b2"
BUCKET = "deos-sample-project-artifacts"
TARGETS = {
    "staging": ("deos-workflow-portal-staging", "deos-staging.voxdez.com", "Staging", "main"),
    "production": ("deos-workflow-portal", "deos.voxdez.com", "Production", "release"),
}


def run(*args, capture=False, env=None):
    result = subprocess.run(
        args, cwd=ROOT, check=True, text=True, stdout=subprocess.PIPE if capture else None, env=env
    )
    return result.stdout.strip() if capture else None


def preflight(config, target):
    worker, host, site, branch = TARGETS[target]
    selected = config["env"]["staging"] if target == "staging" else config
    expected = {
        "name": worker,
        "routes": [{"pattern": host, "custom_domain": True}],
        "d1_databases": [
            {"binding": "DB", "database_name": "deos-sample-project", "database_id": DATABASE}
        ],
        "r2_buckets": [{"binding": "ARTIFACTS", "bucket_name": BUCKET}],
        "services": [
            {
                "binding": "ROUTE_ADMIN",
                "service": "deos-queue-consumer-ts",
                "entrypoint": "RouteAdmin",
            },
            {"binding": "RETRY_ADMIN", "service": "deos-queue-consumer-ts"},
            {"binding": "RECENT_ISSUES", "service": "deos-queue-consumer-ts", "entrypoint": "RecentIssues"},
        ],
        "workers_dev": False,
        "preview_urls": False,
        "version_metadata": {"binding": "CF_VERSION_METADATA"},
    }
    if config.get("account_id") != ACCOUNT or config.get("main") != "src/worker.ts":
        raise ValueError("Unexpected portal account or entrypoint")
    if config.get("assets") != {
        "directory": "./dist",
        "binding": "ASSETS",
        "run_worker_first": True,
        "html_handling": "none",
    }:
        raise ValueError("Unexpected portal assets target")
    for key, value in expected.items():
        if selected.get(key) != value:
            raise ValueError(f"Unexpected {target} {key}")
    for key, value in {
        "PORTAL_SITE": site,
        "PORTAL_CANONICAL_HOST": host,
        "PORTAL_SOURCE_BRANCH": branch,
    }.items():
        if selected.get("vars", {}).get(key) != value:
            raise ValueError(f"Unexpected {target} {key}")
    # Named environments must not redirect account, code, or assets.
    if target == "staging" and any(
        key in selected for key in ("account_id", "main", "assets", "build")
    ):
        raise ValueError("Staging overrides a shared build setting")


def clean_checkout():
    if run("git", "status", "--porcelain", "--untracked-files=normal", capture=True):
        raise ValueError("Deployment requires a clean checkout")
    return run("git", "rev-parse", "HEAD", capture=True)


def check_ref(target, sha):
    run("git", "fetch", "origin", "+refs/heads/main:refs/remotes/origin/main")
    run("git", "merge-base", "--is-ancestor", sha, "origin/main")
    if target == "production":
        run("git", "fetch", "origin", "+refs/heads/release:refs/remotes/origin/release")
        if run("git", "rev-parse", "origin/release", capture=True) != sha:
            raise ValueError("Checkout is not the current release head")


def promote():
    if (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
        or os.environ.get("GITHUB_REF") != "refs/heads/main"
    ):
        raise ValueError("Release promotion requires manual GitHub dispatch from main")
    sha = os.environ.get("REVIEWED_SHA", "")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Supply the full reviewed commit SHA")
    if clean_checkout() != sha:
        raise ValueError("Promotion checkout differs from the reviewed SHA")
    run(
        "git",
        "fetch",
        "origin",
        "+refs/heads/main:refs/remotes/origin/main",
        "+refs/heads/release:refs/remotes/origin/release",
    )
    run("git", "merge-base", "--is-ancestor", sha, "origin/main")
    run("git", "merge-base", "--is-ancestor", "origin/release", sha)
    shared_test_release_guard(sha, "production")
    # A concurrent non-fast-forward movement is rejected by the normal push.
    run("git", "push", "origin", f"{sha}:refs/heads/release")
    run("git", "fetch", "origin", "+refs/heads/release:refs/remotes/origin/release")
    if run("git", "rev-parse", "origin/release", capture=True) != sha:
        raise ValueError("Release changed during promotion")
    run("git", "checkout", "--detach", "origin/release")
    return sha


def provider_deployment(target):
    worker = TARGETS[target][0]
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{worker}/deployments",
        headers={"Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"]},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if not payload.get("success"):
        raise ValueError("Provider deployment read failed")
    deployments = payload["result"]["deployments"]
    if not deployments:
        raise ValueError("Provider returned no deployment")
    return max(deployments, key=lambda item: item["created_on"])


def check_route_access():
    # Wrangler reads zone routes even when deploying only a Custom Domain.
    # Check this before upload so a missing read grant cannot leave a partial deploy.
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/zones/{ZONE}/workers/routes",
        headers={"Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"]},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except OSError as error:
        raise ValueError("Cannot read voxdez.com Worker routes; check Workers Routes Read") from error
    if not payload.get("success"):
        raise ValueError("Cannot read voxdez.com Worker routes; check Workers Routes Read")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def host_version(target):
    request = urllib.request.Request(
        "https://" + TARGETS[target][1] + "/api/version",
        headers={
            "CF-Access-Client-Id": os.environ["PORTAL_ACCESS_CLIENT_ID"],
            "CF-Access-Client-Secret": os.environ["PORTAL_ACCESS_CLIENT_SECRET"],
            "Accept": "application/json",
            "User-Agent": "DEOS-Portal-Release/1.0",
        },
    )
    # Never forward Access credentials through a redirect to a different host.
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
        return json.load(response)


def artifact_digest(sha, files):
    digest = hashlib.sha256()
    digest.update(sha.encode())
    for path in sorted(files):
        relative = str(path.relative_to(ROOT)).encode()
        content = path.read_bytes()
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def validate_readback(target, sha, deployment, version, build_input_sha256):
    _, host, site, branch = TARGETS[target]
    versions = deployment.get("versions", [])
    if len(versions) != 1 or versions[0].get("percentage") != 100:
        raise ValueError("Expected one active version at 100 percent traffic")
    expected = {
        "site": site,
        "canonicalHost": host,
        "sourceBranch": branch,
        "sourceSha": sha,
        "buildInputSha256": build_input_sha256,
        "versionId": versions[0]["version_id"],
    }
    if version != expected:
        raise ValueError("Host metadata does not match the selected commit and provider version")


def deploy(target):
    for name in ("CLOUDFLARE_API_TOKEN", "PORTAL_ACCESS_CLIENT_ID", "PORTAL_ACCESS_CLIENT_SECRET"):
        if not os.environ.get(name):
            raise ValueError(f"Missing {name}")
    if target == "production" and (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
        or os.environ.get("GITHUB_REF") != "refs/heads/main"
    ):
        raise ValueError("Production requires the manual release workflow")
    sha = clean_checkout()
    if target == "production" and sha != os.environ.get("REVIEWED_SHA"):
        raise ValueError("Production checkout differs from the reviewed SHA")
    check_ref(target, sha)
    if target == "staging":
        shared_test_release_guard(sha, "staging")
    config_path = ROOT / "portal/wrangler.jsonc"
    preflight(json.loads(config_path.read_text()), target)
    check_route_access()
    run("npm", "ci")
    run("npm", "run", "portal:test")
    run("npm", "run", "portal:typecheck")
    run("npm", "run", "portal:build")
    run("npx", "--no-install", "esbuild", "portal/src/worker.ts", "--bundle",
        "--format=esm", "--platform=neutral", "--conditions=workerd,worker,browser",
        "--external:cloudflare:*", "--external:node:*",
        "--outfile=" + str(ROOT / "portal-worker/worker.js"))
    worker_bundle = ROOT / "portal-worker/worker.js"
    build_input_sha256 = artifact_digest(
        sha, [worker_bundle, *(path for path in (ROOT / "portal/dist").rglob("*") if path.is_file())]
    )
    if clean_checkout() != sha:
        raise ValueError("Build changed source checkout")
    check_ref(target, sha)
    preflight(json.loads(config_path.read_text()), target)
    pointer = None
    if target == "staging":
        pointer = StagingPointerClient()
        current = pointer.pointer()
        if current["state"] not in ("stable", "uninitialized"):
            raise ValueError("Staging release pointer is busy or blocked")
        if current["state"] == "stable":
            work_id, manifest_id = release_ids("portal", sha, build_input_sha256)
            pointer.begin(work_id, manifest_id, "portal-staging-deploy")
    args = ["npx", "--no-install", "wrangler", "deploy", str(worker_bundle), "--no-bundle", "--config", "portal/wrangler.jsonc"]
    if target == "staging":
        args += ["--env", "staging"]
    args += ["--var", f"PORTAL_SOURCE_SHA:{sha}"]
    args += ["--var", f"PORTAL_BUILD_INPUT_SHA256:{build_input_sha256}"]
    try:
        if pointer is not None and current["state"] == "stable":
            run_with_heartbeat(args, ROOT, pointer, work_id)
        else:
            run(*args)
    except subprocess.CalledProcessError:
        # The provider may have applied a deploy before the CLI lost contact.
        # Read back once, but never convert a failed CLI command to success.
        observed = {}
        for name, read in (("observedDeployment", provider_deployment), ("observedHost", host_version)):
            try:
                observed[name] = read(target)
            except (OSError, ValueError, KeyError, TypeError) as error:
                observed[name + "Error"] = type(error).__name__
        print(json.dumps(observed))
        raise
    deployment = provider_deployment(target)
    version = host_version(target)
    validate_readback(target, sha, deployment, version, build_input_sha256)
    if pointer is not None and current["state"] == "stable":
        pointer.finish(work_id, manifest_id)
    print(json.dumps({"deploymentId": deployment["id"], **version}, indent=2))
