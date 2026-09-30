"""Prepare a hash-pinned candidate for a guarded, single-run test handoff.

All inputs and outputs are files. This command never publishes the branch or
uploads artifacts; those steps need separate readback against live state.
"""

import argparse
import base64
import hashlib
import json
import subprocess
from pathlib import Path


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args])


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-candidate", type=Path, required=True)
    parser.add_argument("--source-candidate-sha", required=True)
    parser.add_argument("--source-head", required=True)
    parser.add_argument("--target-base", required=True)
    parser.add_argument("--target-head", required=True)
    parser.add_argument("--target-run-id", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    source_bytes = args.source_candidate.read_bytes()
    if sha256(source_bytes) != args.source_candidate_sha:
        raise ValueError("source candidate digest differs")
    source = json.loads(source_bytes)
    if git("rev-list", "--parents", "-n", "1", args.target_head).decode().split() != [args.target_head, args.target_base]:
        raise ValueError("target commit does not have the exact base as its only parent")
    expected_tree = git("merge-tree", "--write-tree", args.target_base, args.source_head).decode().strip()
    target_tree = git("rev-parse", f"{args.target_head}^{{tree}}").decode().strip()
    if target_tree != expected_tree:
        raise ValueError("target tree differs from clean source merge")

    paths = git("diff", "--name-only", "--no-renames", "-z", args.target_base, args.target_head).split(b"\0")
    files = []
    for raw in paths:
        if not raw:
            continue
        path = raw.decode("utf-8")
        record = git("ls-tree", "-z", args.target_head, "--", path)
        if not record:
            files.append({"path": path, "mode": "100644", "contentBase64": None, "sha": None})
            continue
        metadata, actual_path = record.rstrip(b"\0").split(b"\t", 1)
        mode, kind, blob_sha = metadata.decode().split()
        if actual_path.decode() != path or kind != "blob" or mode not in {"100644", "100755"}:
            raise ValueError(f"unsupported target file: {path}")
        content = git("show", f"{args.target_head}:{path}")
        files.append({"path": path, "mode": mode,
                      "contentBase64": base64.b64encode(content).decode(), "sha": blob_sha})
    if not files:
        raise ValueError("target commit contains no changed files")

    patch = git("diff", "--binary", "--full-index", "--no-renames", args.target_base, args.target_head)
    patch_sha = sha256(patch)
    candidate = {**source, "outcome": "completed", "testedBaseSha": args.target_base,
                 "treeSha": target_tree, "files": files, "patchSha": patch_sha,
                 "summary": "Reviewed SAC-182 implementation carried onto current main for fresh shared staging proof.",
                 "checks": [], "proof": [], "proofArchive": [], "proofOmissions": [],
                 "evidenceChecklist": None, "assumptions": [
                     "The source run's build and review feedback are historical. All test proof is required from this run."
                 ], "question": None}
    candidate.pop("browserRuntime", None)
    candidate_bytes = json.dumps(candidate, ensure_ascii=False, separators=(",", ":")).encode()
    candidate_sha = sha256(candidate_bytes)
    prefix = f"implementation/{args.target_run_id}"
    metadata = {
        "sourceHeadSha": args.source_head,
        "targetHeadSha": args.target_head,
        "targetBaseSha": args.target_base,
        "targetTreeSha": target_tree,
        "targetPatchKey": f"{prefix}/{patch_sha}/patch.diff",
        "targetPatchSha": patch_sha,
        "targetCandidateKey": f"{prefix}/{candidate_sha}/candidate.json",
        "targetCandidateSha": candidate_sha,
        "changedPaths": [file["path"] for file in files],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "patch.diff").write_bytes(patch)
    (args.output_dir / "candidate.json").write_bytes(candidate_bytes)
    (args.output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps({"targetHeadSha": args.target_head, "targetTreeSha": target_tree,
                      "targetPatchSha": patch_sha, "targetCandidateSha": candidate_sha,
                      "changedFileCount": len(files)}))


if __name__ == "__main__":
    main()
