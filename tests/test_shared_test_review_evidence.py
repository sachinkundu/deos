"""The saved-receipt auditor must reject broken joins, not just count rows."""

import json
import runpy
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
VERIFY = runpy.run_path(str(ROOT / "scripts/verify_shared_test_review_evidence.py"))["verify"]
VERIFY_CONTENT = runpy.run_path(str(ROOT / "scripts/verify_shared_test_review_evidence.py"))["verify_content_cases"]
CANDIDATE = "b2596f7e211f20a289e362971e489857f99cd0ea"
ACTOR = "f010429f-7734-4f3f-9b4b-13a4abb9b4ab"


@pytest.fixture
def evidence():
    return json.loads((ROOT / "docs/evidence/sac-253/sac182-v20-facts.json").read_text())


def test_saved_provider_chain(evidence):
    result = VERIFY(evidence, CANDIDATE, 233623, ACTOR)
    assert result["continuedReviews"] == result["joinedProviderDeliveries"] == 12
    assert result["acceptedParts"] == 18
    assert result["uniqueProviderReceipts"] == 17
    assert "Does not prove" in result["limit"]


@pytest.mark.parametrize("fault, message", [
    ("candidate", "candidate mismatch"),
    ("missing_transition", "transition count mismatch"),
    ("duplicate_transition", "transition count mismatch"),
    ("payload", "payload or processing mismatch"),
    ("linear_actor", "Linear actor mismatch"),
    ("head", "wrong gate decision"),
    ("github_actor", "GitHub actor mismatch"),
    ("part", "provider marker mismatch"),
    ("duplicate_marker", "duplicate review or reply marker"),
    ("unfinished_attempt", "unfinished step attempt"),
])
def test_changed_receipt_is_rejected(evidence, fault, message):
    if fault == "candidate":
        evidence["candidateCommit"] = "0" * 40
    elif fault == "missing_transition":
        evidence["chain"]["transitions"].pop()
    elif fault == "duplicate_transition":
        evidence["chain"]["transitions"].append(evidence["chain"]["transitions"][0])
    elif fault == "payload":
        evidence["signedProviderDeliveries"][0]["payload_sha"] = "0" * 64
    elif fault == "linear_actor":
        evidence["signedProviderDeliveries"][0]["actor_id"] = "different-actor"
    elif fault == "head":
        evidence["chain"]["gates"][0]["approved_head_sha"] = "0" * 40
    elif fault == "github_actor":
        evidence["github"]["records"][0]["actorId"] = 999
    elif fault == "part":
        evidence["github"]["records"][0]["markers"][0]["partId"] = "different-part"
    elif fault == "duplicate_marker":
        record = evidence["github"]["records"][0]
        record["markers"].append(record["markers"][0])
    elif fault == "unfinished_attempt":
        evidence["facts"]["attempts"][0]["outcome"] = None
    with pytest.raises(ValueError, match=message):
        VERIFY(evidence, CANDIDATE, 233623, ACTOR)


@pytest.mark.parametrize("case, field, value, message", [
    ("s03", "inline_notes", 0, "s03 missing inline note"),
    ("s04", "inline_notes", 0, "s04 missing approval with two inline notes"),
    ("s05", "replies", 1, "s05 missing approval without inline notes or replies"),
    ("s06", "review_type", "APPROVE", "s06 missing rejected review replaced by a Comment"),
    ("s06", "supersedes_review_id", None, "s06 missing rejected review replaced by a Comment"),
])
def test_continuation_does_not_prove_missing_content(evidence, case, field, value, message):
    for row in evidence["facts"]["intents"]:
        if row["scenario_id"].split("-")[0] == case and row["outcome"] == "continued":
            row[field] = value
    with pytest.raises(ValueError, match=message):
        VERIFY_CONTENT(evidence["facts"])


def test_rejected_review_must_not_start_linear(evidence):
    original = next(row for row in evidence["facts"]["intents"]
                    if row["scenario_id"].startswith("s06") and
                    row["outcome"] == "abandoned_before_linear")
    evidence["facts"]["attempts"].append({
        "review_id": original["review_id"], "step": "linear", "outcome": "clearly_rejected"})
    with pytest.raises(ValueError, match="s06 missing rejected review replaced by a Comment"):
        VERIFY_CONTENT(evidence["facts"])
