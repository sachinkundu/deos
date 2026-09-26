"""Pin the first full staging manifest after both app services are live."""

import json
import uuid

from shared_test_staging_pointer import StagingPointerClient, release_ids


def bootstrap():
    client = StagingPointerClient()
    client.assert_no_active_attempts()
    site = client.query("""SELECT state,owner_run_id,owner_lease_id
        FROM test_environment WHERE site_id=1""")["results"]
    if (len(site) != 1 or site[0]["state"] != "free" or
            site[0]["owner_run_id"] is not None or
            site[0]["owner_lease_id"] is not None):
        raise ValueError("Shared test site must be free before staging bootstrap")
    pointer = client.pointer()
    if pointer["state"] not in ("uninitialized", "updating"):
        raise ValueError("The staging pointer has already been initialized or is blocked")
    first, second = client.traffic(), client.traffic()
    if first != second:
        raise ValueError("Staging traffic changed before bootstrap")
    if pointer["state"] == "updating":
        work_id, manifest_id = client.matching_work(
            pointer, "bootstrap", first["revision"], first["revision"])
    else:
        work_id, manifest_id = release_ids("bootstrap", first["revision"],
                                           first["revision"], pointer["revision"])
    client.assert_no_active_attempts()
    owner = "staging-bootstrap:" + str(uuid.uuid4())
    client.begin(work_id, manifest_id, owner)
    saved = client.finish(work_id, manifest_id, owner)
    print(json.dumps({"state": saved["state"], "manifestId": saved["manifest_id"],
                      "trafficRevision": saved["traffic_revision"]}, indent=2))


if __name__ == "__main__":
    bootstrap()
