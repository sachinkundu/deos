"""Build and publish the bundled BettaView Worker for an exact raw build."""

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

from portal_release import BUCKET, run


def build(root: Path, source_commit: str, build_digest: str) -> tuple[bytes, dict]:
    if not re.fullmatch(r"[a-f0-9]{40}", source_commit) or not re.fullmatch(
        r"[a-f0-9]{64}", build_digest
    ):
        raise ValueError("Invalid compiled Worker subject")
    root = root.resolve(strict=True)
    if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root,
                               text=True).strip() != source_commit:
        raise ValueError("Compiled Worker checkout differs from saved commit")
    if subprocess.check_output(["git", "status", "--porcelain",
                                "--untracked-files=normal"], cwd=root, text=True).strip():
        raise ValueError("Compiled Worker checkout has source changes")
    with tempfile.TemporaryDirectory(prefix="deos-bettaview-worker-") as directory:
        output = Path(directory) / "worker.js"
        subprocess.run([
            "npx", "--no-install", "esbuild", "portal/bettaview/worker/index.js",
            "--bundle", "--format=esm", "--platform=browser", "--target=es2022",
            "--conditions=workerd,worker,browser", "--external:cloudflare:*",
            "--outfile=" + str(output),
        ], cwd=root, check=True)
        raw = output.read_bytes()
    if not raw or len(raw) > 5_000_000:
        raise ValueError("Compiled Worker size is invalid")
    digest = hashlib.sha256(raw).hexdigest()
    return raw, {"serviceName": "bettaview", "sourceCommit": source_commit,
                 "buildInputSha256": build_digest, "compiledSha256": digest,
                 "bytes": len(raw)}


def publish(raw: bytes, receipt: dict) -> str:
    if set(receipt) != {"serviceName", "sourceCommit", "buildInputSha256",
                        "compiledSha256", "bytes"} or receipt["serviceName"] != "bettaview" or \
            not re.fullmatch(r"[a-f0-9]{40}", receipt["sourceCommit"]) or \
            not re.fullmatch(r"[a-f0-9]{64}", receipt["buildInputSha256"]) or \
            hashlib.sha256(raw).hexdigest() != receipt["compiledSha256"] or \
            len(raw) != receipt["bytes"] or not 0 < len(raw) <= 5_000_000:
        raise ValueError("Compiled Worker receipt differs from bytes")
    key = ("shared-test/compiled-workers/bettaview/" + receipt["sourceCommit"] +
           "/" + receipt["buildInputSha256"] + "/" + receipt["compiledSha256"] + ".js")
    with tempfile.TemporaryDirectory(prefix="deos-compiled-worker-publish-") as directory:
        upload = Path(directory) / "worker.js"
        download = Path(directory) / "readback.js"
        upload.write_bytes(raw)
        run("npx", "--no-install", "wrangler", "r2", "object", "put",
            f"{BUCKET}/{key}", "--file", str(upload), "--remote",
            "--content-type", "application/javascript")
        run("npx", "--no-install", "wrangler", "r2", "object", "get",
            f"{BUCKET}/{key}", "--file", str(download), "--remote")
        if hashlib.sha256(download.read_bytes()).hexdigest() != receipt["compiledSha256"]:
            raise ValueError("Compiled Worker R2 readback differs")
    return key


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    builder = sub.add_parser("build")
    builder.add_argument("--candidate-root", required=True, type=Path)
    builder.add_argument("--bundle-receipt", required=True, type=Path)
    builder.add_argument("--output", required=True, type=Path)
    builder.add_argument("--receipt", required=True, type=Path)
    uploader = sub.add_parser("publish")
    uploader.add_argument("--module", required=True, type=Path)
    uploader.add_argument("--receipt", required=True, type=Path)
    args = parser.parse_args()
    if args.command == "build":
        base = json.loads(args.bundle_receipt.read_text())
        if base.get("serviceName") != "bettaview":
            raise ValueError("Not a BettaView build receipt")
        raw, receipt = build(args.candidate_root, base["candidateCommit"],
                             base["buildInputSha256"])
        args.output.write_bytes(raw)
        args.receipt.write_text(json.dumps(receipt, sort_keys=True))
        print(json.dumps(receipt, sort_keys=True))
    else:
        receipt = json.loads(args.receipt.read_text())
        key = publish(args.module.read_bytes(), receipt)
        print(json.dumps({"r2Key": key, "compiledSha256": receipt["compiledSha256"]},
                         sort_keys=True))


if __name__ == "__main__":
    main()
