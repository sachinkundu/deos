"""Disposable real D1 probe for the multi-statement schema API contract."""

from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request
from pathlib import Path

ACCOUNT = "c68856288112af7698f5be52ea94b96e"
ROOT = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database"


def token() -> str:
    value = os.environ.get("CLOUDFLARE_API_TOKEN")
    if value:
        return value
    path = Path("/Users/sachin/code/deos/.env")
    for line in path.read_text().splitlines():
        if line.startswith("CLOUDFLARE_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"\'')
    raise RuntimeError("Cloudflare token unavailable")


def call(auth: str, method: str, path: str, payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(
        ROOT + path,
        data=body,
        method=method,
        headers={
            "Authorization": "Bearer " + auth,
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status == 204:
                return {"success": True}
            value = json.load(response)
    except urllib.error.HTTPError as error:
        raw = error.read().decode(errors="replace").replace(auth, "[redacted]")
        raise RuntimeError(f"Cloudflare {method} {path}: HTTP {error.code} {raw}") from error
    if value.get("success") is not True:
        raise RuntimeError(f"Cloudflare {method} {path}: {value.get('errors')}")
    return value


def query(auth: str, database_id: str, sql: str) -> list[dict]:
    rows = call(auth, "POST", f"/{database_id}/query", {"sql": sql})["result"]
    if not isinstance(rows, list) or not rows or any(row.get("success") is not True for row in rows):
        raise RuntimeError(f"D1 query batch failed: {rows}")
    return rows


def main() -> None:
    auth = token()
    name = "deos-test-schema-probe-" + secrets.token_hex(8)
    database_id: str | None = None
    print("probe", "temporary database")
    try:
        created = call(auth, "POST", "", {"name": name})["result"]
        database_id = created["uuid"]
        if created["name"] != name:
            raise RuntimeError("Created D1 name changed")
        print("create", "confirmed")
        query(auth, database_id,
              "CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL);"
              "INSERT INTO probe(id,value) VALUES (1,'first');")
        found = query(auth, database_id, "SELECT id,value FROM probe ORDER BY id")
        if found[0].get("results") != [{"id": 1, "value": "first"}]:
            raise RuntimeError(f"Multi-statement D1 readback changed: {found}")
        print("multi_statement_readback", "confirmed")
    finally:
        if database_id:
            call(auth, "DELETE", "/" + database_id)
            for index in range(2):
                rows = call(auth, "GET", "?name=" + name)["result"]
                if rows:
                    raise RuntimeError(f"Probe D1 remains after delete read {index + 1}: {name}")
            print("delete_absence", "confirmed_twice")


if __name__ == "__main__":
    main()
