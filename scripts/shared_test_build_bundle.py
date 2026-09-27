"""Keep the exact staging build bytes for a later isolated test lease."""

import base64
import hashlib
import json
import re
import tempfile
from pathlib import Path

from portal_release import BUCKET, ROOT, run


def artifact_digest(source_commit, files, root=None):
    """Hash exactly the bytes and relative paths consumed by the Worker."""
    root = root or ROOT
    digest = hashlib.sha256(source_commit.encode("ascii"))
    for path in sorted(files):
        relative = path.relative_to(root).as_posix().encode("utf-8")
        content = path.read_bytes()
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def bundle(service_name, source_commit, files, build_digest, root=None):
    root = root or ROOT
    if service_name not in ("portal", "bettaview") or not re.fullmatch(
        r"[a-f0-9]{40}", source_commit
    ) or not re.fullmatch(r"[a-f0-9]{64}", build_digest):
        raise ValueError("Invalid shared test build identity")
    paths = {
        "portal": ("portal-worker/worker.js", "portal/dist/", "migrations/", None),
        "bettaview": ("portal/bettaview/worker/index.js", "portal/bettaview/dist/",
                      None, "portal/bettaview/worker/"),
    }
    worker, assets, migrations, modules = paths[service_name]
    selected = sorted(set(files))
    names = [path.relative_to(root).as_posix() for path in selected]
    if (len(selected) != len(files) or worker not in names or not any(
        name.startswith(assets) for name in names
    ) or (migrations and "migrations/0001_initial.sql" not in names) or any(
        name != worker and not name.startswith(assets) and not (
            migrations and name.startswith(migrations) and name.endswith(".sql")
        ) and not (
            modules and name.startswith(modules) and name.endswith(".js")
        ) for name in names
    )):
        raise ValueError("Invalid shared test build file set")
    if artifact_digest(source_commit, selected, root) != build_digest:
        raise ValueError("Shared test build bytes differ from staging digest")
    result = {"serviceName": service_name, "sourceCommit": source_commit,
              "files": [{"path": name, "contentBase64": base64.b64encode(path.read_bytes()).decode("ascii")}
                        for name, path in zip(names, selected)]}
    raw = json.dumps(result, separators=(",", ":"), sort_keys=True).encode("utf-8")
    if len(raw) > 30_000_000:
        raise ValueError("Shared test build bundle exceeds 30 MB")
    return raw


def publish_raw(service_name, source_commit, build_digest, raw):
    if service_name not in ("portal", "bettaview") or not re.fullmatch(
        r"[a-f0-9]{40}", source_commit
    ) or not re.fullmatch(r"[a-f0-9]{64}", build_digest):
        raise ValueError("Invalid shared test build identity")
    key = f"shared-test/builds/{service_name}/{source_commit}/{build_digest}.json"
    with tempfile.TemporaryDirectory(prefix="deos-shared-test-build-") as directory:
        upload = Path(directory) / "upload.json"
        download = Path(directory) / "readback.json"
        upload.write_bytes(raw)
        run("npx", "--no-install", "wrangler", "r2", "object", "put",
            f"{BUCKET}/{key}", "--file", str(upload), "--remote",
            "--content-type", "application/json")
        run("npx", "--no-install", "wrangler", "r2", "object", "get",
            f"{BUCKET}/{key}", "--file", str(download), "--remote")
        if hashlib.sha256(download.read_bytes()).digest() != hashlib.sha256(raw).digest():
            raise ValueError("Shared test build R2 readback differs from upload")
    return key


def publish(service_name, source_commit, files, build_digest):
    raw = bundle(service_name, source_commit, files, build_digest)
    return publish_raw(service_name, source_commit, build_digest, raw)
