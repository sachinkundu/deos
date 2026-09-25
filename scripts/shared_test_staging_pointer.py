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

    def _json(self, url, *, body=None, bearer=True):
        headers = {"Accept": "application/json", "User-Agent": "DEOS-Staging-Pointer/1.0"}
        if bearer:
            headers["Authorization"] = "Bearer " + self.token
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
        return self._json(f"https://{service['host']}/api/version", bearer=False)

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
            return previous
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

    def heartbeat(self, work_id):
        now = _now()
        due = (datetime.now(UTC) + timedelta(minutes=2)).isoformat()
        result = self.query("""UPDATE staging_release_pointer SET heartbeat_due_at=?,
            updated_at=?,revision=revision+1 WHERE site_id=1 AND state='updating'
            AND work_id=? AND heartbeat_due_at>?""", (due, now, work_id, now))
        if result["meta"].get("changes") != 1:
            raise ValueError("Staging pointer heartbeat was fenced")

    def finish(self, work_id, planned_manifest_id):
        self.heartbeat(work_id)
        first = self.traffic()
        self.heartbeat(work_id)
        second = self.traffic()
        self.heartbeat(work_id)
        if first != second:
            raise ValueError("Staging traffic changed between readbacks")
        pointer = self.pointer()
        if (pointer["state"] != "updating" or pointer["work_id"] != work_id or
                pointer["planned_manifest_id"] != planned_manifest_id):
            raise ValueError("Staging release plan changed before commit")
        revision = pointer["revision"] + 1
        services = [{key: row[key] for key in ("serviceName", "sourceCommit", "deployVersion",
                                                "buildInputSha256", "appPaths", "providerPaths")}
                    for row in first["services"]]
        digest = _digest(services)
        now = _now()
        self.query("""INSERT OR IGNORE INTO staging_release_manifests
            (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
            SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staging_release_pointer
              WHERE site_id=1 AND state='updating' AND work_id=? AND revision=?)""",
                   (planned_manifest_id, revision, first["revision"], len(services), digest,
                    now, work_id, pointer["revision"]))
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
            WHERE site_id=1 AND state='updating' AND work_id=? AND planned_manifest_id=?
              AND revision=? AND EXISTS (SELECT 1 FROM staging_release_manifests
                WHERE manifest_id=? AND revision=? AND digest_sha256=?)""",
                            (planned_manifest_id, revision, first["revision"], now, work_id,
                             planned_manifest_id, pointer["revision"], planned_manifest_id,
                             revision, digest))
        if result["meta"].get("changes") != 1:
            raise ValueError("Staging release pointer commit failed")
        saved_pointer = self.pointer()
        if (saved_pointer["state"] != "stable" or
                saved_pointer["manifest_id"] != planned_manifest_id or
                saved_pointer["traffic_revision"] != first["revision"]):
            raise ValueError("Staging release pointer readback differs")
        return saved_pointer


def release_ids(target, sha, build_digest):
    work_id = "staging:" + _digest([target, sha, build_digest])
    return work_id, "manifest:" + _digest([work_id])


def run_with_heartbeat(command, cwd, pointer, work_id):
    process = subprocess.Popen(command, cwd=cwd)
    try:
        while True:
            try:
                code = process.wait(timeout=30)
                if code:
                    raise subprocess.CalledProcessError(code, command)
                return
            except subprocess.TimeoutExpired:
                pointer.heartbeat(work_id)
    except BaseException:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        raise
