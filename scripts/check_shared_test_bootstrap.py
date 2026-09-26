"""Read-only remote evidence for the SAC-253 staging bootstrap."""

import json

from shared_test_staging_pointer import StagingPointerClient


def main() -> None:
    client = StagingPointerClient()
    checks = {
        "activeAttempts": """SELECT count(*) AS count FROM agent_attempts
            WHERE state IN ('pending','starting','running','collecting')""",
        "migration": """SELECT name FROM d1_migrations
            WHERE name='0055_shared_test_environment.sql'""",
        "site": """SELECT state,owner_run_id,owner_lease_id,fence
            FROM test_environment WHERE site_id=1""",
        "pointer": """SELECT state,manifest_id,revision
            FROM staging_release_pointer WHERE site_id=1""",
    }
    rows = {name: client.query(sql)["results"] for name, sql in checks.items()}
    if any(len(value) != 1 for value in rows.values()):
        raise ValueError("Remote shared test bootstrap rows are incomplete")
    if rows["activeAttempts"][0]["count"] != 0:
        raise ValueError("Active agent attempts block staging bootstrap")
    site = rows["site"][0]
    if (site["state"] != "free" or site["owner_run_id"] is not None or
            site["owner_lease_id"] is not None):
        raise ValueError("Shared test site is not free for staging bootstrap")
    if rows["pointer"][0]["state"] not in ("uninitialized", "updating"):
        raise ValueError("Staging pointer is not ready for bootstrap")
    print(json.dumps({name: value[0] for name, value in rows.items()}, sort_keys=True))


if __name__ == "__main__":
    main()
