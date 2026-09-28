"""Build bounded test-service bundles from an exact, uncredentialed PR checkout."""

import argparse
import json
import re
import subprocess
from pathlib import Path

from shared_test_build_bundle import artifact_digest, bundle


def command(root, *args, capture=False):
    result = subprocess.run(args, cwd=root, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def clean_commit(root, expected):
    if command(root, "git", "rev-parse", "HEAD", capture=True) != expected:
        raise ValueError("Candidate checkout is not the saved commit")
    if command(root, "git", "status", "--porcelain", "--untracked-files=normal",
               capture=True):
        raise ValueError("Candidate checkout has source changes")


def build(root, commit, service):
    clean_commit(root, commit)
    if service == "portal":
        command(root, "npm", "ci")
        command(root, "npm", "run", "portal:test")
        command(root, "npm", "run", "portal:typecheck")
        command(root, "npm", "run", "portal:build")
        command(root, "npx", "--no-install", "esbuild", "portal/src/worker.ts",
                "--bundle", "--format=esm", "--platform=neutral",
                "--conditions=workerd,worker,browser", "--external:cloudflare:*",
                "--external:node:*", "--outfile=" + str(root / "portal-worker/worker.js"))
        files = [root / "portal-worker/worker.js",
                 *(path for path in (root / "portal/dist").rglob("*") if path.is_file()),
                 *sorted((root / "migrations").glob("*.sql"))]
    elif service == "bettaview":
        command(root, "npm", "ci", "--prefix", "portal/bettaview")
        command(root, "npm", "run", "bettaview:build")
        command(root, "npm", "run", "bettaview:test")
        files = [*sorted((root / "portal/bettaview/worker").glob("*.js")),
                 *(path for path in (root / "portal/bettaview/dist").rglob("*")
                   if path.is_file())]
    else:
        raise ValueError("Unknown candidate service")
    clean_commit(root, commit)
    digest = artifact_digest(commit, files, root)
    raw = bundle(service, commit, files, digest, root)
    return digest, raw


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-root", required=True, type=Path)
    parser.add_argument("--commit")
    parser.add_argument("--service", choices=("portal", "bettaview"))
    parser.add_argument("--request-file", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args()
    request = json.loads(args.request_file.read_text()) if args.request_file else {
        "candidateCommit": args.commit, "service": args.service}
    if set(request) != {"candidateCommit", "service"}:
        raise ValueError("Invalid candidate request")
    commit, service = request["candidateCommit"], request["service"]
    if not isinstance(commit, str) or not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Invalid candidate commit")
    if service not in ("portal", "bettaview"):
        raise ValueError("Invalid candidate service")
    root = args.candidate_root.resolve(strict=True)
    if not (root / ".git").exists():
        raise ValueError("Candidate root is not a checkout")
    digest, raw = build(root, commit, service)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(raw)
    receipt = {"serviceName": service, "candidateCommit": commit,
               "buildInputSha256": digest, "bytes": len(raw)}
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, sort_keys=True))
    print(json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    main()
