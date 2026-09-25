"""Pin the first full staging manifest after both app services are live."""

import json

from shared_test_staging_pointer import StagingPointerClient, release_ids


def bootstrap():
    client = StagingPointerClient()
    pointer = client.pointer()
    if pointer["state"] != "uninitialized":
        raise ValueError("The staging pointer has already been initialized or is blocked")
    first, second = client.traffic(), client.traffic()
    if first != second:
        raise ValueError("Staging traffic changed before bootstrap")
    work_id, manifest_id = release_ids("bootstrap", first["revision"], first["revision"])
    client.begin(work_id, manifest_id, "staging-bootstrap")
    saved = client.finish(work_id, manifest_id)
    print(json.dumps({"state": saved["state"], "manifestId": saved["manifest_id"],
                      "trafficRevision": saved["traffic_revision"]}, indent=2))


if __name__ == "__main__":
    bootstrap()
