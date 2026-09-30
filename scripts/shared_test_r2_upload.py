"""Use an existing bucket token through R2's S3 API, without wider permissions."""

import hashlib
import json
import os
import re
import urllib.error
import urllib.request

from portal_release import ACCOUNT, BUCKET, NoRedirect


def credentials(token):
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/tokens/verify",
        headers={"Authorization": "Bearer " + token},
    )
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace").replace(token, "[redacted]")
        raise RuntimeError(f"R2 token verification failed: HTTP {error.code}: {detail}") from error
    result = payload.get("result", {})
    if payload.get("success") is not True or result.get("status") != "active" or not re.fullmatch(
        r"[a-f0-9]{32}", result.get("id", "")
    ):
        raise ValueError("R2 token verification returned no active token identity")
    # Cloudflare documents this representation of the same token. No token is created.
    return result["id"], hashlib.sha256(token.encode("utf-8")).hexdigest()


def publish(key, raw, content_type, client=None):
    if not re.fullmatch(
        r"shared-test/(?:builds/(?:portal|bettaview)/[a-f0-9]{40}/[a-f0-9]{64}\.json|"
        r"compiled-workers/bettaview/[a-f0-9]{40}/[a-f0-9]{64}/[a-f0-9]{64}\.js|"
        r"review-runtimes/[a-f0-9]{40}/[a-f0-9]{64}\.js)", key
    ) or not 0 < len(raw) <= 30_000_000:
        raise ValueError("R2 candidate upload scope is invalid")
    if client is None:
        import boto3
        from botocore.config import Config

        token = os.environ["CLOUDFLARE_API_TOKEN"]
        access_key, secret = credentials(token)
        client = boto3.client(
            "s3", endpoint_url=f"https://{ACCOUNT}.r2.cloudflarestorage.com",
            region_name="auto", aws_access_key_id=access_key, aws_secret_access_key=secret,
            config=Config(signature_version="s3v4", retries={"total_max_attempts": 1},
                          connect_timeout=30, read_timeout=60,
                          request_checksum_calculation="when_required",
                          response_checksum_validation="when_required"),
        )
    from botocore.exceptions import ClientError

    try:
        client.put_object(Bucket=BUCKET, Key=key, Body=raw,
                          ContentType=content_type, IfNoneMatch="*")
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "PreconditionFailed":
            raise
        # An existing immutable object is accepted only after byte-for-byte readback.
    response = client.get_object(Bucket=BUCKET, Key=key)
    with response["Body"] as stream:
        checked = stream.read(len(raw) + 1)
    if checked != raw:
        raise ValueError(f"R2 immutable candidate object differs: {key}")


def enabled():
    transport = os.environ.get("SHARED_TEST_UPLOAD_TRANSPORT", "wrangler")
    if transport not in ("wrangler", "s3"):
        raise ValueError("Unknown shared test upload transport")
    return transport == "s3"
