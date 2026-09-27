"""Upload a checked candidate bundle with a credential held only by this job."""

import argparse
import base64
import binascii
import hashlib
import json
import os
import re
from pathlib import Path

from shared_test_build_bundle import publish_raw


def verify(raw, receipt):
    if not isinstance(receipt, dict) or set(receipt) != {
        "serviceName", "candidateCommit", "buildInputSha256", "bytes"
    }:
        raise ValueError("Invalid candidate build receipt")
    service, commit, expected = (receipt["serviceName"],
                                 receipt["candidateCommit"],
                                 receipt["buildInputSha256"])
    if service not in ("portal", "bettaview") or not isinstance(commit, str) or not re.fullmatch(
        r"[a-f0-9]{40}", commit
    ) or not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("Invalid candidate build subject")
    if not isinstance(receipt["bytes"], int) or len(raw) != receipt["bytes"] or len(raw) > 30_000_000:
        raise ValueError("Candidate bundle length differs from receipt")
    document = json.loads(raw)
    if not isinstance(document, dict) or set(document) != {"serviceName", "sourceCommit", "files"} or \
            document["serviceName"] != service or document["sourceCommit"] != commit or \
            not isinstance(document["files"], list) or not 2 <= len(document["files"]) <= 2000:
        raise ValueError("Candidate bundle subject differs from receipt")
    digest = hashlib.sha256(commit.encode("ascii"))
    paths = set()
    total = 0
    decoded = []
    for entry in document["files"]:
        if not isinstance(entry, dict) or set(entry) != {"path", "contentBase64"} or \
                not isinstance(entry["path"], str) or not isinstance(entry["contentBase64"], str):
            raise ValueError("Invalid candidate bundle file")
        path = entry["path"]
        if path in paths or path.startswith("/") or "\\" in path or any(
            part in ("", ".", "..") for part in path.split("/")
        ):
            raise ValueError("Invalid candidate bundle path")
        paths.add(path)
        try:
            content = base64.b64decode(entry["contentBase64"], validate=True)
        except binascii.Error as error:
            raise ValueError("Invalid candidate bundle encoding") from error
        total += len(content)
        if total > 20_000_000:
            raise ValueError("Candidate bundle exceeds decoded size limit")
        decoded.append((path, content))
    worker = "portal-worker/worker.js" if service == "portal" else "portal/bettaview/worker/index.js"
    assets = "portal/dist/" if service == "portal" else "portal/bettaview/dist/"
    allowed = (lambda path: path == worker or path.startswith(assets) or
               (service == "portal" and path.startswith("migrations/") and path.endswith(".sql")) or
               (service == "bettaview" and path.startswith("portal/bettaview/worker/") and path.endswith(".js")))
    if worker not in paths or not any(path.startswith(assets) for path in paths) or \
            (service == "portal" and "migrations/0001_initial.sql" not in paths) or \
            any(not allowed(path) for path in paths):
        raise ValueError("Candidate bundle file set is invalid")
    for path, content in sorted(decoded, key=lambda item: tuple(item[0].split("/"))):
        name = path.encode("utf-8")
        digest.update(len(name).to_bytes(4, "big"))
        digest.update(name)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    if digest.hexdigest() != expected:
        raise ValueError("Candidate bundle digest differs from receipt")
    return service, commit, expected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if not os.environ.get("CLOUDFLARE_API_TOKEN"):
        raise ValueError("Candidate upload credential is missing")
    raw = args.bundle.read_bytes()
    receipt = json.loads(args.receipt.read_text())
    service, commit, digest = verify(raw, receipt)
    key = publish_raw(service, commit, digest, raw)
    print(json.dumps({"r2Key": key, "bundleSha256": hashlib.sha256(raw).hexdigest()},
                     sort_keys=True))


if __name__ == "__main__":
    main()
