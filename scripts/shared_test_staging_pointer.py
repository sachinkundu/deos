"""Durable staging pointer for the fixed portal and BettaView service set."""

import hashlib
import json
import os
import re
import subprocess
import urllib.request
from datetime import UTC, datetime, timedelta

ACCOUNT = "c68856288112af7698f5be52ea94b96e"
DATABASE = "4e854f8a-018a-42c4-a325-c4b8805c06b2"
SERVICES = (
    {"name": "bettaview", "worker": "deos-bettaview-portal-staging",
     "host": "bettaview-staging.voxdez.com", "appPaths": ["portal/bettaview/"],
     "providerPaths": []},
    {"name": "portal", "worker": "deos-workflow-portal-staging",
     "host": "deos-staging.voxdez.com",
     "appPaths": ["portal/", "web/", "app/", "pages/", "components/",
                  "src/components/", "src/App.", "public/"],
     "providerPaths": ["src/deos/", "src/entry.py", "src/linear-",
                       "src/github-", "src/capability-"]},
)


def _digest(value):
    return hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()


def _now():
    return datetime.now(UTC).isoformat()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class StagingPointerClient:
    def __init__(self, token=None, opener=None):
        self.token = token or os.environ["CLOUDFLARE_API_TOKEN"]
        self.opener = opener or urllib.request.build_opener(NoRedirect())

    def _json(self, url, *, body=None, bearer=True, access=False):
        headers = {"Accept": "application/json", "User-Agent": "DEOS-Staging-Pointer/1.0"}
        if bearer:
            headers["Authorization"] = "Bearer " + self.token
        if access:
            headers["CF-Access-Client-Id"] = os.environ["PORTAL_ACCESS_CLIENT_ID"]
            headers["CF-Access-Client-Secret"] = os.environ["PORTAL_ACCESS_CLIENT_SECRET"]
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, headers=headers,
                                         data=None if body is None else json.dumps(body).encode())
        with self.opener.open(request, timeout=30) as response:
            return json.load(response)

    def query(self, sql, params=()):
        payload = self._json(
            f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DATABASE}/query",
            body={"sql": sql, "params": [str(value) for value in params]},
        )
        rows = payload.get("result")
        if payload.get("success") is not True or not isinstance(rows, list) or len(rows) != 1 or rows[0].get("success") is not True:
            raise ValueError("Staging pointer D1 query failed: " + json.dumps(payload.get("errors", [])))
        return rows[0]

    def pointer(self):
        rows = self.query("SELECT * FROM staging_release_pointer WHERE site_id=1")["results"]
        if len(rows) != 1:
            raise ValueError("Staging pointer is missing")
        return rows[0]

    def assert_no_active_attempts(self):
        rows = self.query("""SELECT attempt_id,run_id,node_id,state FROM agent_attempts
            WHERE state IN ('pending','starting','running','collecting')
            ORDER BY created_at LIMIT 5""")["results"]
        if rows:
            raise ValueError("Staging deploy requires a stopped agent gate: " + json.dumps(rows))

    def matching_work(self, pointer, target, sha, build_digest):
        work_id = pointer.get("work_id") or ""
        parts = work_id.split(":")
        if (pointer.get("state") != "updating" or len(parts) != 4 or
                parts[0] != "staging" or parts[1] != target or
                not parts[2].isdigit()):
            raise ValueError("Staging release pointer is busy or blocked")
        expected = release_ids(target, sha, build_digest, int(parts[2]))
        if (work_id, pointer.get("planned_manifest_id")) != expected:
            raise ValueError("Staging release pointer belongs to different build inputs")
        return expected

    def has_planned_manifest(self, manifest_id):
        rows = self.query("SELECT manifest_id FROM staging_release_manifests WHERE manifest_id=?",
                          (manifest_id,))["results"]
        return len(rows) == 1

    def target_running(self, target, sha, build_digest):
        first, second = self.traffic(), self.traffic()
        if first != second:
            raise ValueError("Staging traffic changed between recovery readbacks")
        matches = [row for row in first["services"] if row["serviceName"] == target]
        if len(matches) != 1:
            raise ValueError("Staging target is missing from full traffic readback")
        return (matches[0]["sourceCommit"] == sha and
                matches[0]["buildInputSha256"] == build_digest)

    def stable_target_recorded(self, pointer, target, sha, build_digest):
        if pointer["state"] != "stable":
            return False
        rows = self.query("""SELECT source_commit,build_input_sha256 FROM staging_release_services
            WHERE manifest_id=? AND service_name=?""",
                          (pointer["manifest_id"], target))["results"]
        if len(rows) != 1:
            raise ValueError("Stable staging manifest lacks the target service")
        if (rows[0]["source_commit"] != sha or
                rows[0]["build_input_sha256"] != build_digest):
            return False
        first, second = self.traffic(), self.traffic()
        if first != second or first["revision"] != pointer["traffic_revision"]:
            raise ValueError("Recorded staging target has traffic drift")
        return True

    def prepare_deploy(self, target, sha, build_digest, owner):
        current = self.pointer()
        if current["state"] == "uninitialized":
            return {"action": "deploy", "tracked": False}
        if current["state"] == "stable":
            if self.stable_target_recorded(current, target, sha, build_digest):
                return {"action": "noop", "tracked": False}
            work_id, manifest_id = release_ids(target, sha, build_digest,
                                               current["revision"])
            self.begin(work_id, manifest_id, owner)
            return {"action": "deploy", "tracked": True,
                    "work_id": work_id, "manifest_id": manifest_id}
        if current["state"] == "updating":
            work_id, manifest_id = self.matching_work(current, target, sha, build_digest)
            self.begin(work_id, manifest_id, owner)
            if self.has_planned_manifest(manifest_id) or self.target_running(
                    target, sha, build_digest):
                self.finish(work_id, manifest_id, owner)
                return {"action": "recovered", "tracked": False}
            return {"action": "deploy", "tracked": True,
                    "work_id": work_id, "manifest_id": manifest_id}
        raise ValueError("Staging release pointer is blocked")

    def _deployment(self, service):
        payload = self._json(
            f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{service['worker']}/deployments"
        )
        if payload.get("success") is not True:
            raise ValueError(f"Staging deployment read failed for {service['name']}")
        rows = payload.get("result", {}).get("deployments", [])
        if not rows:
            raise ValueError(f"Staging deployment missing for {service['name']}")
        deployed = max(rows, key=lambda row: row["created_on"])
        versions = deployed.get("versions", [])
        if len(versions) != 1 or versions[0].get("percentage") != 100:
            raise ValueError(f"Staging traffic is mixed for {service['name']}")
        return deployed, versions[0]["version_id"]

    def _host(self, service):
        return self._json(f"https://{service['host']}/api/version", bearer=False, access=True)

    def traffic(self):
        rows = []
        for service in SERVICES:
            deployed, version_id = self._deployment(service)
            host = self._host(service)
            if (host.get("canonicalHost") != service["host"] or
                    host.get("versionId") != version_id or
                    not isinstance(host.get("sourceSha"), str) or
                    re.fullmatch(r"[a-f0-9]{40}", host["sourceSha"]) is None or
                    not isinstance(host.get("buildInputSha256"), str) or
                    re.fullmatch(r"[a-f0-9]{64}", host["buildInputSha256"]) is None):
                raise ValueError(f"Staging host and deployment differ for {service['name']}")
            rows.append({"serviceName": service["name"],
                         "sourceCommit": host["sourceSha"],
                         "deployVersion": version_id,
                         "buildInputSha256": host["buildInputSha256"],
                         "appPaths": service["appPaths"],
                         "providerPaths": service["providerPaths"],
                         "deploymentId": deployed["id"]})
        revision = _digest([[row["serviceName"], row["deploymentId"]] for row in rows])
        return {"revision": revision, "services": rows}

    def begin(self, work_id, planned_manifest_id, owner):
        if not work_id or not planned_manifest_id or not owner:
            raise ValueError("Invalid staging release plan")
        previous = self.pointer()
        if previous["state"] == "updating" and previous["work_id"] == work_id and previous["planned_manifest_id"] == planned_manifest_id:
            now = _now()
            if previous["owner"] == owner and previous["heartbeat_due_at"] > now:
                return previous
            if previous["heartbeat_due_at"] > now:
                raise ValueError("Staging release work still has a live owner")
            due = (datetime.now(UTC) + timedelta(minutes=2)).isoformat()
            result = self.query("""UPDATE staging_release_pointer SET owner=?,
                heartbeat_due_at=?,revision=revision+1,updated_at=?
                WHERE site_id=1 AND state='updating' AND work_id=?
                AND planned_manifest_id=? AND revision=? AND heartbeat_due_at<=?""",
                                (owner, due, now, work_id, planned_manifest_id,
                                 previous["revision"], now))
            if result["meta"].get("changes") != 1:
                raise ValueError("Staging release work changed before recovery")
            return self.pointer()
        if previous["state"] not in ("stable", "uninitialized"):
            raise ValueError("Staging release pointer is busy or blocked")
        now = _now()
        due = (datetime.now(UTC) + timedelta(minutes=2)).isoformat()
        result = self.query("""UPDATE staging_release_pointer SET state='updating',
            work_id=?,owner=?,planned_manifest_id=?,heartbeat_due_at=?,revision=revision+1,
            updated_at=? WHERE site_id=1 AND revision=? AND state IN ('stable','uninitialized')""",
                            (work_id, owner, planned_manifest_id, due, now, previous["revision"]))
        if result["meta"].get("changes") != 1:
            raise ValueError("Staging release pointer changed before the deploy")
        return self.pointer()

    def heartbeat(self, work_id, owner):
        now = _now()
        due = (datetime.now(UTC) + timedelta(minutes=2)).isoformat()
        result = self.query("""UPDATE staging_release_pointer SET heartbeat_due_at=?,
            updated_at=?,revision=revision+1 WHERE site_id=1 AND state='updating'
            AND work_id=? AND owner=? AND heartbeat_due_at>?""",
                            (due, now, work_id, owner, now))
        if result["meta"].get("changes") != 1:
            raise ValueError("Staging pointer heartbeat was fenced")

    def finish(self, work_id, planned_manifest_id, owner):
        self.heartbeat(work_id, owner)
        first = self.traffic()
        self.heartbeat(work_id, owner)
        second = self.traffic()
        self.heartbeat(work_id, owner)
        if first != second:
            raise ValueError("Staging traffic changed between readbacks")
        pointer = self.pointer()
        if (pointer["state"] != "updating" or pointer["work_id"] != work_id or
                pointer["planned_manifest_id"] != planned_manifest_id or
                pointer["owner"] != owner):
            raise ValueError("Staging release plan changed before commit")
        services = [{key: row[key] for key in ("serviceName", "sourceCommit", "deployVersion",
                                                "buildInputSha256", "appPaths", "providerPaths")}
                    for row in first["services"]]
        digest = _digest(services)
        now = _now()
        prior = self.query("SELECT * FROM staging_release_manifests WHERE manifest_id=?",
                           (planned_manifest_id,))["results"]
        if prior:
            if (len(prior) != 1 or prior[0]["traffic_revision"] != first["revision"] or
                    prior[0]["service_count"] != len(services) or
                    prior[0]["digest_sha256"] != digest):
                raise ValueError("Planned staging manifest differs from current traffic")
            revision = prior[0]["revision"]
        else:
            revision = pointer["revision"] + 1
            result = self.query("""INSERT OR IGNORE INTO staging_release_manifests
                (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
                SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staging_release_pointer
                  WHERE site_id=1 AND state='updating' AND work_id=? AND revision=?)""",
                               (planned_manifest_id, revision, first["revision"], len(services),
                                digest, now, work_id, pointer["revision"]))
            if result["meta"].get("changes") != 1:
                raise ValueError("Staging manifest insert lost its release plan")
        for row in services:
            self.query("""INSERT OR IGNORE INTO staging_release_services
                (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
                 app_paths_json,provider_paths_json,read_at)
                SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staging_release_pointer
                  WHERE site_id=1 AND state='updating' AND work_id=? AND revision=?)""",
                       (planned_manifest_id, row["serviceName"], row["sourceCommit"],
                        row["deployVersion"], row["buildInputSha256"],
                        json.dumps(row["appPaths"], separators=(",", ":")),
                        json.dumps(row["providerPaths"], separators=(",", ":")),
                        now, work_id, pointer["revision"]))
        saved = self.query("""SELECT service_name,source_commit,deploy_version,build_input_sha256,
            app_paths_json,provider_paths_json FROM staging_release_services
            WHERE manifest_id=? ORDER BY service_name""", (planned_manifest_id,))["results"]
        manifest = self.query("SELECT * FROM staging_release_manifests WHERE manifest_id=?",
                              (planned_manifest_id,))["results"]
        if len(manifest) != 1 or manifest[0]["digest_sha256"] != digest or len(saved) != len(services):
            raise ValueError("Staging manifest readback differs")
        for actual, expected in zip(saved, services, strict=True):
            if (actual["service_name"] != expected["serviceName"] or
                    actual["source_commit"] != expected["sourceCommit"] or
                    actual["deploy_version"] != expected["deployVersion"] or
                    actual["build_input_sha256"] != expected["buildInputSha256"] or
                    json.loads(actual["app_paths_json"]) != expected["appPaths"] or
                    json.loads(actual["provider_paths_json"]) != expected["providerPaths"]):
                raise ValueError("Staging service manifest readback differs")
        result = self.query("""UPDATE staging_release_pointer SET state='stable',manifest_id=?,
            manifest_revision=?,traffic_revision=?,work_id=NULL,owner=NULL,
            planned_manifest_id=NULL,heartbeat_due_at=NULL,revision=revision+1,updated_at=?
            WHERE site_id=1 AND state='updating' AND work_id=? AND owner=?
              AND planned_manifest_id=?
              AND revision=? AND EXISTS (SELECT 1 FROM staging_release_manifests
                WHERE manifest_id=? AND revision=? AND digest_sha256=?)""",
                            (planned_manifest_id, revision, first["revision"], now, work_id,
                             owner, planned_manifest_id, pointer["revision"], planned_manifest_id,
                             revision, digest))
        if result["meta"].get("changes") != 1:
            raise ValueError("Staging release pointer commit failed")
        saved_pointer = self.pointer()
        if (saved_pointer["state"] != "stable" or
                saved_pointer["manifest_id"] != planned_manifest_id or
                saved_pointer["traffic_revision"] != first["revision"]):
            raise ValueError("Staging release pointer readback differs")
        return saved_pointer


def release_ids(target, sha, build_digest, base_revision=0):
    if not isinstance(base_revision, int) or base_revision < 0 or ":" in target:
        raise ValueError("Invalid staging release identity")
    work_id = f"staging:{target}:{base_revision}:{_digest([target, sha, build_digest])}"
    return work_id, "manifest:" + _digest([work_id])


def run_with_heartbeat(command, cwd, pointer, work_id, owner):
    process = subprocess.Popen(command, cwd=cwd)
    try:
        while True:
            try:
                code = process.wait(timeout=30)
                if code:
                    raise subprocess.CalledProcessError(code, command)
                return
            except subprocess.TimeoutExpired:
                pointer.heartbeat(work_id, owner)
    except BaseException:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        raise
