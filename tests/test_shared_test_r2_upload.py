"""The bucket credential must not need account-wide REST object permissions."""
import io
import sys
from pathlib import Path

import pytest
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from shared_test_r2_upload import publish

KEY = "shared-test/builds/portal/" + "a" * 40 + "/" + "b" * 64 + ".json"


class Store:
    def __init__(self, existing=None, error=None):
        self.value, self.error, self.writes = existing, error, 0

    def put_object(self, **args):
        assert args["Bucket"] == "deos-sample-project-artifacts"
        assert args["Key"] == KEY
        assert args["IfNoneMatch"] == "*"
        self.writes += 1
        if self.error or self.value is not None:
            raise ClientError({"Error": {"Code": self.error or "PreconditionFailed"}}, "PutObject")
        self.value = args["Body"]

    def get_object(self, **args):
        return {"Body": io.BytesIO(self.value)}


def test_create_only_upload_and_matching_retry():
    store = Store()
    publish(KEY, b"candidate", "application/json", store)
    publish(KEY, b"candidate", "application/json", store)
    assert store.value == b"candidate"
    assert store.writes == 2


def test_existing_different_bytes_and_provider_failure_stay_errors():
    with pytest.raises(ValueError, match="differs"):
        publish(KEY, b"candidate", "application/json", Store(b"different"))
    with pytest.raises(ClientError, match="AccessDenied"):
        publish(KEY, b"candidate", "application/json", Store(error="AccessDenied"))


def test_foreign_key_is_rejected_before_provider_call():
    store = Store()
    with pytest.raises(ValueError, match="scope"):
        publish("production/worker.js", b"candidate", "application/javascript", store)
    assert store.writes == 0
