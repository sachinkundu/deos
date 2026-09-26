"""Observe exact implementation merge proof before staging or live release."""

import hashlib
import json
import os
import subprocess
import traceback

from shared_test_staging_pointer import StagingPointerClient


def _sha(value):
    return hashlib.sha256(value.encode()).hexdigest()


def _canonical(value):
    return json.dumps(value, separators=(",", ":"))


def git(*args):
    return subprocess.run(("git", *args), check=True, text=True,
                          stdout=subprocess.PIPE).stdout.strip()


def exact_merge_subject(commit):
    row = git("rev-list", "--parents", "-n", "1", commit).split()
    if len(row) != 3 or row[0] != commit:
        return None
    return {"base": row[1], "candidate": row[2],
            "tree": git("rev-parse", commit + "^{tree}"),
            "paths": sorted(set(git("diff", "--name-only", "--no-renames", row[1], commit).splitlines()))}


def check_commit(commit, client):
    if len(commit) != 40 or any(ch not in "0123456789abcdef" for ch in commit):
        raise ValueError("Release subject is not a full commit SHA")
    links = client.query("SELECT * FROM test_release_commit_links WHERE release_commit_sha=?",
                         (commit,))["results"]
    if len(links) != 1:
        return {"proofAllowed": False, "reason": "release_link_missing", "releaseCommit": commit}
    link = links[0]
    subject = exact_merge_subject(commit)
    if not subject or (subject["base"] != link["tested_base_sha"] or
                       subject["candidate"] != link["candidate_commit_sha"] or
                       subject["tree"] != link["tree_sha"]):
        return {"proofAllowed": False, "reason": "release_merge_subject_changed", "releaseCommit": commit}
    decisions = client.query("""SELECT * FROM test_task_decisions WHERE run_id=?
        AND candidate_commit=? AND patch_sha256=? AND manifest_id=? AND manifest_revision=?""",
                             (link["run_id"], link["candidate_commit_sha"], link["patch_sha256"],
                              link["manifest_id"], link["manifest_revision"]))["results"]
    if len(decisions) != 1:
        return {"proofAllowed": False, "reason": "release_decision_missing", "releaseCommit": commit}
    decision = decisions[0]
    manifests = client.query("SELECT * FROM staging_release_manifests WHERE manifest_id=? AND revision=?",
                             (link["manifest_id"], link["manifest_revision"]))["results"]
    services = client.query("SELECT * FROM staging_release_services WHERE manifest_id=? ORDER BY service_name",
                            (link["manifest_id"],))["results"]
    if len(manifests) != 1 or len(services) != manifests[0]["service_count"]:
        return {"proofAllowed": False, "reason": "release_manifest_missing", "releaseCommit": commit}
    normalized = [{"serviceName": row["service_name"], "sourceCommit": row["source_commit"],
                   "deployVersion": row["deploy_version"],
                   "buildInputSha256": row["build_input_sha256"],
                   "appPaths": json.loads(row["app_paths_json"]),
                   "providerPaths": json.loads(row["provider_paths_json"])} for row in services]
    if _sha(_canonical(normalized)) != manifests[0]["digest_sha256"]:
        return {"proofAllowed": False, "reason": "release_manifest_changed", "releaseCommit": commit}
    roots = [root for row in normalized for root in row["appPaths"] + row["providerPaths"]]
    paths = subject["paths"]
    matched = [path for path in paths if any(path.startswith(root) for root in roots)]
    choice = "test_required" if matched else "test_not_required"
    if (decision["choice"] != choice or link["choice"] != choice or
            decision["changed_paths_sha256"] != _sha(_canonical(paths)) or
            json.loads(decision["matched_paths_json"]) != matched):
        return {"proofAllowed": False, "reason": "release_path_decision_changed", "releaseCommit": commit}
    if choice == "test_required":
        attestations = client.query("""SELECT a.attestation_id FROM test_attestations a
            JOIN test_lease_closures c ON c.attestation_id=a.attestation_id
            WHERE a.run_id=? AND a.candidate_commit=? AND a.patch_sha256=?
              AND a.manifest_id=? AND a.manifest_revision=? AND a.state='complete'
              AND c.report_state='complete'""",
                                    (link["run_id"], link["candidate_commit_sha"],
                                     link["patch_sha256"], link["manifest_id"],
                                     link["manifest_revision"]))["results"]
        if len(attestations) != 1:
            return {"proofAllowed": False, "reason": "release_test_not_complete", "releaseCommit": commit}
    return {"proofAllowed": True, "reason": choice, "releaseCommit": commit}


def check_range(base, head, client):
    """Check every new first-parent commit; a later merge cannot hide an earlier app change."""
    if not all(len(sha) == 40 and all(ch in "0123456789abcdef" for ch in sha)
               for sha in (base, head)):
        raise ValueError("Release range needs full commit SHAs")
    git("merge-base", "--is-ancestor", base, head)
    commits = git("rev-list", "--first-parent", "--reverse", f"{base}..{head}").splitlines()
    services = client.query("SELECT app_paths_json,provider_paths_json FROM staging_release_services")["results"]
    if not services:
        return {"proofAllowed": False, "reason": "release_manifest_missing",
                "releaseCommit": head, "checkedCommits": []}
    roots = sorted({root for row in services
                    for field in ("app_paths_json", "provider_paths_json")
                    for root in json.loads(row[field])})
    # A change to the path policy itself requires an exact reviewed release link.
    roots.append("config/workflow.implementation.yaml")
    checked = []
    for commit in commits:
        parents = git("rev-list", "--parents", "-n", "1", commit).split()
        if len(parents) < 2 or parents[0] != commit or parents[1] == commit:
            raise ValueError("Release history has an invalid first parent")
        paths = sorted(set(git("diff", "--name-only", "--no-renames",
                               parents[1], commit).splitlines()))
        if any(path.startswith(root) for path in paths for root in roots):
            proof = check_commit(commit, client)
        else:
            proof = {"proofAllowed": True, "reason": "outside_test_roots",
                     "releaseCommit": commit}
        checked.append(proof)
    denied = next((item for item in checked if not item["proofAllowed"]), None)
    return {"proofAllowed": denied is None,
            "reason": denied["reason"] if denied else "range_checked",
            "releaseCommit": head, "checkedCommits": checked}


def guard(commit, stage, client=None, base=None, base_loader=None):
    mode = os.environ.get("SHARED_TEST_RELEASE_GUARD", "observe")
    if mode not in ("observe", "enforce"):
        raise ValueError("Invalid shared test release guard mode")
    try:
        if base_loader is not None:
            if base is not None:
                raise ValueError("Release guard received two base sources")
            base = base_loader()
        reader = client or StagingPointerClient()
        result = check_range(base, commit, reader) if base else check_commit(commit, reader)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        if mode == "enforce":
            raise
        traceback.print_exception(error)
        result = {"proofAllowed": False, "reason": "release_guard_read_failed",
                  "releaseCommit": commit, "error": str(error)}
    print(json.dumps({"stage": stage, "mode": mode, **result}, sort_keys=True))
    if mode == "enforce" and not result["proofAllowed"]:
        raise ValueError(f"Shared test release guard denied {stage}: {result['reason']}")
    return result
