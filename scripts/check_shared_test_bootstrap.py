"""Read-only remote evidence for the SAC-253 staging bootstrap."""

import json

from shared_test_staging_pointer import StagingPointerClient


def main() -> None:
    client = StagingPointerClient()
    checks = {
        "activeAttempts": """SELECT attempt_id,run_id,node_id,state FROM agent_attempts
            WHERE state IN ('pending','starting','running','collecting')
            ORDER BY created_at LIMIT 5""",
        "migration": """SELECT name FROM d1_migrations
            WHERE name='0055_shared_test_environment.sql'""",
        "site": """SELECT state,owner_run_id,owner_lease_id,fence
            FROM test_environment WHERE site_id=1""",
        "pointer": """SELECT state,manifest_id,revision
            FROM staging_release_pointer WHERE site_id=1""",
    }
    rows = {name: client.query(sql)["results"] for name, sql in checks.items()}
    if any(len(value) != 1 for name, value in rows.items() if name != "activeAttempts"):
        raise ValueError("Remote shared test bootstrap rows are incomplete")
    if rows["activeAttempts"]:
        raise ValueError("Active agent attempts block staging bootstrap: " +
                         json.dumps(rows["activeAttempts"], sort_keys=True))
    site = rows["site"][0]
    if (site["state"] != "free" or site["owner_run_id"] is not None or
            site["owner_lease_id"] is not None):
        raise ValueError("Shared test site is not free for staging bootstrap")
    if rows["pointer"][0]["state"] not in ("uninitialized", "updating", "stable"):
        raise ValueError("Staging pointer is not ready for bootstrap")
    services = client.query("""SELECT service_name,source_commit,deploy_version,
        build_input_sha256 FROM staging_release_services
        WHERE manifest_id=? ORDER BY service_name""",
        (rows["pointer"][0]["manifest_id"],))["results"] if rows["pointer"][0]["state"] == "stable" else []
    if rows["pointer"][0]["state"] == "stable" and [
        row["service_name"] for row in services
    ] != ["bettaview", "portal"]:
        raise ValueError("Stable staging pointer has an incomplete service set")
    print(json.dumps({name: value[0] for name, value in rows.items()
                      if name != "activeAttempts"} |
                     {"activeAttempts": [], "stagingServices": services}, sort_keys=True))


if __name__ == "__main__":
    main()
