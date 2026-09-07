## ADDED Requirements

### Requirement: Mark the issue Done after workflow success

When a workflow records `succeeded` as its final result, DEOS SHALL ask Linear to move the source issue to `Done`. This call is best effort. Its result MUST NOT delay or change the final result.

DEOS SHALL retry the same call only for a known short-term error that is safe to retry. The retry count MUST have a set limit. DEOS MUST NOT retry any other error.

DEOS MUST NOT add its own record or receipt for this call. It MUST NOT read the issue state after the call. It MUST NOT add a repair job or a later check. A failed call MUST NOT start more workflow work.

#### Scenario: Successful workflow sends the Done request

- **WHEN** a workflow records `succeeded` as its final result
- **THEN** DEOS sends Linear a request to move that workflow's source issue to `Done`

#### Scenario: Known transient error permits a retry

- **WHEN** the Done call fails with a known short-term error that is safe to retry
- **THEN** DEOS retries the same call up to the set limit and keeps the workflow complete

#### Scenario: Final request failure does not change the outcome

- **WHEN** the Done call has any other error or reaches the retry limit
- **THEN** the workflow stays `succeeded`, and DEOS does not check, record, or repair the Linear state

#### Scenario: Other terminal outcomes do not send the request

- **WHEN** a workflow ends with a failed, blocked, denied, or canceled outcome
- **THEN** DEOS does not send the Linear Done request for that outcome
