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
    print(json.dumps({name: value[0] for name, value in rows.items()}, sort_keys=True))


if __name__ == "__main__":
    main()
