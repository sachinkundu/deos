"""Bundle the candidate's real review service and Workflow for a lease runtime."""

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

from portal_release import BUCKET, run


def build(root: Path, commit: str) -> tuple[bytes, dict]:
    root = root.resolve(strict=True)
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Invalid review runtime source")
    if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root,
                               text=True).strip() != commit:
        raise ValueError("Review runtime checkout differs")
    if subprocess.check_output(["git", "status", "--porcelain",
                                "--untracked-files=normal"], cwd=root, text=True).strip():
        raise ValueError("Review runtime checkout has source changes")
    with tempfile.TemporaryDirectory(prefix="deos-review-runtime-") as directory:
        entry = Path(directory) / "entry.js"
        output = Path(directory) / "runtime.js"
        entry.write_text(
            "export {ReviewContinuation} from " +
            json.dumps(str(root / "src/review-continuation-entrypoint.ts")) + ";\n" +
            "export {DeosWorkflow} from " +
            json.dumps(str(root / "src/deos-workflow.ts")) + ";\n" +
            "export {D1OrchestrationStore} from " +
            json.dumps(str(root / "src/orchestration-store.ts")) + ";\n" +
            "export {loadWorkflowDefinition} from " +
            json.dumps(str(root / "src/workflow-definition.ts")) + ";\n"
        )
        subprocess.run([
            "npx", "--no-install", "esbuild", str(entry), "--bundle", "--format=esm",
            "--platform=neutral", "--target=es2022", "--main-fields=browser,module,main",
            "--conditions=workerd,worker,browser", "--external:cloudflare:*",
            "--external:node:*", "--loader:.yaml=text", "--loader:.md=text",
            "--minify-whitespace", "--legal-comments=none",
            "--outfile=" + str(output),
        ], cwd=root, check=True)
        raw = output.read_bytes()
    if not 0 < len(raw) <= 10_000_000:
        raise ValueError("Review runtime module size invalid")
    return raw, {"sourceCommit": commit,
                 "compiledSha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}


def publish(raw: bytes, receipt: dict) -> str:
    if set(receipt) != {"sourceCommit", "compiledSha256", "bytes"} or \
            not re.fullmatch(r"[a-f0-9]{40}", receipt["sourceCommit"]) or \
            hashlib.sha256(raw).hexdigest() != receipt["compiledSha256"] or \
            receipt["bytes"] != len(raw) or not 0 < len(raw) <= 10_000_000:
        raise ValueError("Review runtime receipt differs from bytes")
    key = ("shared-test/review-runtimes/" + receipt["sourceCommit"] + "/" +
           receipt["compiledSha256"] + ".js")
    from shared_test_r2_upload import enabled
    from shared_test_r2_upload import publish as publish_s3
    if enabled():
        publish_s3(key, raw, "application/javascript")
    else:
        with tempfile.TemporaryDirectory(prefix="deos-review-runtime-upload-") as directory:
            upload, download = Path(directory) / "upload.js", Path(directory) / "readback.js"
            upload.write_bytes(raw)
            run("npx", "--no-install", "wrangler", "r2", "object", "put", f"{BUCKET}/{key}",
                "--file", str(upload), "--remote", "--content-type", "application/javascript")
            run("npx", "--no-install", "wrangler", "r2", "object", "get", f"{BUCKET}/{key}",
                "--file", str(download), "--remote")
            if hashlib.sha256(download.read_bytes()).hexdigest() != receipt["compiledSha256"]:
                raise ValueError("Review runtime readback differs")
    return key


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    builder = sub.add_parser("build")
    builder.add_argument("--candidate-root", type=Path, required=True)
    source = builder.add_mutually_exclusive_group(required=True)
    source.add_argument("--candidate-commit")
    source.add_argument("--bundle-receipt", type=Path)
    builder.add_argument("--output", type=Path, required=True)
    builder.add_argument("--receipt", type=Path, required=True)
    uploader = sub.add_parser("publish")
    uploader.add_argument("--module", type=Path, required=True)
    uploader.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "build":
        commit = args.candidate_commit
        if args.bundle_receipt:
            bundle = json.loads(args.bundle_receipt.read_text())
            if bundle.get("serviceName") != "bettaview":
                raise ValueError("Not a BettaView build receipt")
            commit = bundle["candidateCommit"]
        raw, receipt = build(args.candidate_root, commit)
        args.output.write_bytes(raw)
        args.receipt.write_text(json.dumps(receipt, sort_keys=True))
        print(json.dumps(receipt, sort_keys=True))
    else:
        receipt = json.loads(args.receipt.read_text())
        print(json.dumps({"r2Key": publish(args.module.read_bytes(), receipt)}))


if __name__ == "__main__":
    main()
