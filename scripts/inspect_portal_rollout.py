"""Read the portal rollout state without changing provider resources."""

import argparse
import hashlib
import importlib.util
import json
import subprocess
from email import message_from_bytes
from email.policy import default
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = "c68856288112af7698f5be52ea94b96e"
WORKER = "deos-workflow-portal"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    args = parser.parse_args()
    helper = ROOT / ".agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py"
    spec = importlib.util.spec_from_file_location("telemetry_credentials", helper)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    account, token = module.load_credentials(args.env_file, ROOT / "wrangler.jsonc")
    if account != ACCOUNT:
        raise ValueError("Unexpected Cloudflare account")

    def request(path):
        return urlopen(
            Request(
                "https://api.cloudflare.com/client/v4" + path,
                headers={"Authorization": "Bearer " + token},
            ),
            timeout=30,
        )

    def api(path):
        with request(path) as response:
            payload = json.load(response)
        if not payload.get("success"):
            raise ValueError("Provider read failed")
        return payload["result"]

    def github(path):
        return json.loads(subprocess.check_output(["gh", "api", path], text=True))

    base = f"/accounts/{ACCOUNT}/workers/scripts/{WORKER}"
    deployments = api(base + "/deployments")["deployments"]
    active = max(deployments, key=lambda row: row["created_on"])
    with request(base) as response:
        content_type, content = response.headers["Content-Type"], response.read()
    message = message_from_bytes(
        ("Content-Type: " + content_type + "\r\n\r\n").encode() + content, policy=default
    )
    code = {}
    for part in message.iter_parts():
        name = part.get_filename() or part.get_param("name", header="content-disposition")
        if name and name.endswith((".js", ".mjs")):
            code[name] = hashlib.sha256(part.get_payload(decode=True)).hexdigest()
    environments = []
    for name in ["staging", "production"]:
        path = f"repos/sachinkundu/deos/environments/{name}"
        env = github(path)
        environments.append(
            {
                "name": name,
                "protectionTypes": [rule["type"] for rule in env["protection_rules"]],
                "branches": [
                    {"name": p["name"], "type": p["type"]}
                    for p in github(path + "/deployment-branch-policies")["branch_policies"]
                ],
                "secretNames": [secret["name"] for secret in github(path + "/secrets")["secrets"]],
                "variableNames": [var["name"] for var in github(path + "/variables")["variables"]],
            }
        )
    release = github("repos/sachinkundu/deos/git/ref/heads/release")["object"]["sha"]
    staging_base = f"/accounts/{ACCOUNT}/workers/scripts/deos-workflow-portal-staging"
    staging = max(api(staging_base + "/deployments")["deployments"], key=lambda row: row["created_on"])
    staging_settings = api(staging_base + "/settings")
    print(
        json.dumps(
            {
                "production": {
                    "deploymentId": active["id"],
                    "versions": active["versions"],
                    "workerModuleSha256": code,
                    "sharedBindings": [
                        b
                        for b in api(base + "/settings")["bindings"]
                        if b["type"] in ["d1", "r2_bucket", "service"]
                    ],
                },
                "staging": {
                    "deploymentId": staging["id"],
                    "versions": staging["versions"],
                    "bindings": [
                        b for b in staging_settings["bindings"]
                        if b["type"] in ["d1", "r2_bucket", "service"]
                        or (b["type"] == "plain_text" and b["name"].startswith("PORTAL_"))
                    ],
                },
                "portalDomains": [
                    {key: domain.get(key) for key in ("hostname", "service", "enabled", "previews_enabled")}
                    for domain in api(f"/accounts/{ACCOUNT}/workers/domains")
                    if domain["service"] in [WORKER, "deos-workflow-portal-staging"]
                ],
                "releaseSha": release,
                "githubEnvironments": environments,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
