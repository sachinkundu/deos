"""Check the saved SAC-182 receipt chain; this does not run a live demo."""

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def instant(value):
    return datetime.fromisoformat(value)


def index(rows, key):
    result = {row[key]: row for row in rows}
    require(len(result) == len(rows), f"duplicate {key}")
    return result


def verify_content_cases(facts):
    """Check the content and replacement subcases visible in saved D1 rows."""
    intents = index(facts["intents"], "review_id")

    def completed(case):
        return [i for i in intents.values() if i["scenario_id"].split("-")[0] == case
                and i["outcome"] == "continued"]

    require(any(i["review_type"] == "REQUEST_CHANGES" and i["inline_notes"] >= 1
                and i["replies"] >= 1 and i["summaries"] >= 1 for i in completed("s03")),
            "s03 missing inline note, reply, or summary")
    require(any(i["review_type"] == "APPROVE" and i["inline_notes"] >= 2
                for i in completed("s04")), "s04 missing approval with two inline notes")
    require(any(i["review_type"] == "APPROVE" and i["inline_notes"] == 0
                and i["replies"] == 0 for i in completed("s05")),
            "s05 missing approval without inline notes or replies")
    replacements = []
    for review in completed("s06"):
        prior = intents.get(review["supersedes_review_id"])
        if review["review_type"] != "COMMENT" or not prior:
            continue
        attempts = [a for a in facts["attempts"] if a["review_id"] == prior["review_id"]]
        if (prior["scenario_id"] == review["scenario_id"] and
                prior["outcome"] == "abandoned_before_linear" and prior["transitions"] == 0 and
                prior["linear_status"] == "not_started" and
                any(a["step"] == "github" and a["outcome"] == "clearly_rejected"
                    for a in attempts) and all(a["step"] != "linear" for a in attempts)):
            replacements.append(review["review_id"])
    require(replacements, "s06 missing rejected review replaced by a Comment before Linear")
    return ["s03 content", "s04 noted approval", "s05 empty notes", "s06 Comment replacement"]


def verify(data, candidate, github_user, linear_actor):
    require(data["version"] == 1, "unsupported evidence version")
    require(data["candidateCommit"] == candidate, "candidate mismatch")
    facts, chain = data["facts"], data["chain"]
    intents = index(chain["intents"], "review_id")
    events = index(chain["events"], "delivery_id")
    deliveries = index(data["signedProviderDeliveries"], "delivery_id")
    gates = {(g["run_id"], g["visit_sequence"]): g for g in chain["gates"]}
    require(len(gates) == len(chain["gates"]), "duplicate gate visit")
    continued = [i for i in intents.values() if i["outcome"] == "continued"]
    require(Counter(t["review_id"] for t in chain["transitions"]) ==
            Counter(i["review_id"] for i in continued), "transition count mismatch")
    required = {f"s{i:02d}" for i in range(3, 13)}
    require(required <= {i["scenario_id"].split("-")[0] for i in continued},
            "missing completed publication scenario")
    fact_intents = index(facts["intents"], "review_id")
    require(fact_intents.keys() == intents.keys(), "intent inventory mismatch")
    require(all(all(fact_intents[key][field] == row[field] for field in
                    ("scenario_id", "review_type", "supersedes_review_id", "outcome"))
                for key, row in intents.items()), "intent summary mismatch")
    content_cases = verify_content_cases(facts)

    for transition in chain["transitions"]:
        review = intents[transition["review_id"]]
        gate = gates[(review["run_id"], review["gate_visit_sequence"])]
        event = events[transition["cause_reference"]]
        delivery = deliveries[event["delivery_id"]]
        label = f"review {review['review_id']}"
        require(review["run_id"] == transition["run_id"] == event["run_id"],
                f"{label}: run mismatch")
        require(review["scenario_id"] == transition["scenario_id"] ==
                event["scenario_id"] == delivery["scenario_id"], f"{label}: scenario mismatch")
        require(gate["decision_delivery_id"] == event["delivery_id"] and
                event["review_id"] == review["review_id"], f"{label}: gate receipt mismatch")
        require(event["payload_digest"] == delivery["payload_sha"] and
                event["state"] == "processed", f"{label}: payload or processing mismatch")
        require(event["actor_id"] == delivery["actor_id"] == linear_actor,
                f"{label}: Linear actor mismatch")
        approved = review["review_type"] == "APPROVE"
        require(transition["from_node"] == "review" and
                transition["cause_type"] == "linear_event" and
                transition["to_node"] == ("approved" if approved else "edited"),
                f"{label}: wrong workflow edge")
        require(event["from_state_name"] == "Human Review" and
                event["to_state_name"] == ("Merging" if approved else "In Progress"),
                f"{label}: wrong Linear state change")
        require(gate["decision_outcome"] ==
                ("merge_authorized" if approved else "revision_requested") and
                gate["approved_head_sha"] == review["head_sha"], f"{label}: wrong gate decision")
        require(instant(review["review_ready_at"]) <= instant(event["provider_time"]) <=
                instant(transition["occurred_at"]), f"{label}: invalid event order")
        require(instant(event["provider_time"]) == instant(delivery["provider_time"]) and
                delivery["forwarded_at"] is not None, f"{label}: missing forwarded receipt")

    require(all(a["outcome"] is not None for a in facts["attempts"]), "unfinished step attempt")
    require(all(i["transitions"] == 0 for i in facts["intents"]
                if i["outcome"] != "continued"), "non-continued review moved the gate")
    records = {str(r["id"]): r for r in data["github"]["records"]}
    require(len(records) == len(data["github"]["records"]), "duplicate provider record")
    markers = Counter()
    for record in records.values():
        for marker in record["markers"]:
            if marker.get("kind") in ("review_bundle", "reply"):
                markers[(marker.get("reviewId"), marker.get("partId"), marker["kind"])] += 1
    require(all(n == 1 for n in markers.values()), "duplicate review or reply marker")
    accepted = []
    for part in chain["parts"]:
        if part["receipt_status"] not in ("done", "published_prior_intent"):
            continue
        record, review = records[part["github_record_id"]], intents[part["review_id"]]
        expected = review["supersedes_review_id"] if part["receipt_status"] == \
            "published_prior_intent" else review["review_id"]
        require(record["actorId"] == github_user, f"part {part['part_id']}: GitHub actor mismatch")
        require(any(m.get("reviewId") == expected and m.get("partId") == part["part_id"] and
                    m.get("kind") == part["kind"] and
                    m.get("headSha") == part["github_commit_sha"] for m in record["markers"]),
                f"part {part['part_id']}: provider marker mismatch")
        if part["kind"] == "review_bundle":
            require(record["commitId"] == review["head_sha"] == part["github_commit_sha"] and
                    part["github_event"] == review["review_type"] and record["state"] == {
                        "APPROVE": "APPROVED", "COMMENT": "COMMENTED",
                        "REQUEST_CHANGES": "CHANGES_REQUESTED"}[review["review_type"]],
                    f"part {part['part_id']}: GitHub commit or review choice mismatch")
        accepted.append(part["github_record_id"])
    return {"candidateCommit": candidate, "continuedReviews": len(continued),
            "joinedProviderDeliveries": len(chain["transitions"]),
            "acceptedParts": len(accepted), "uniqueProviderReceipts": len(set(accepted)),
            "unfinishedAttempts": 0, "duplicateReviewOrReplyMarkers": 0,
            "savedContentCaseChecks": content_cases,
            "limit": "Saved receipt consistency and listed content checks only. Does not prove all subcases, screenshots, distinct users, cleanup, or a completed demo."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("facts", type=Path)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--github-user", required=True, type=int)
    parser.add_argument("--linear-actor", required=True)
    args = parser.parse_args()
    print(json.dumps(verify(json.loads(args.facts.read_text()), args.candidate,
                            args.github_user, args.linear_actor), indent=2))
