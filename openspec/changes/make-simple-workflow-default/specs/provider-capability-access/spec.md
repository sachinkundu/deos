## ADDED Requirements

### Requirement: Govern one full-delivery pull request per run
The system SHALL allocate one stable repository branch and one pull-request identity for each simple workflow run. The delivery capability SHALL accept only the run's repository, base branch, OpenSpec change identity, stable operation identity, review replies, and complete allowlisted work-product manifest. It SHALL create or update that same pull request across revision attempts and SHALL durably record its branch, pull request, head commit, manifest digest, and provider receipt. The capability MUST NOT expose provider credentials or allow another run, repository, change, branch, or pull request to be substituted.

#### Scenario: Initial full-delivery publication
- **WHEN** the first delivery attempt submits a valid complete manifest for its recorded run
- **THEN** the capability publishes the files to the stable run branch, creates one pull request, and records the confirmed identity and head

#### Scenario: Revision updates the work product
- **WHEN** a later attempt for the same run submits a valid revised manifest and replies to supplied review threads
- **THEN** the capability updates the recorded branch and pull request, posts each bounded reply, and records the new confirmed head without creating another pull request

#### Scenario: Manifest omits required work
- **WHEN** the submitted manifest omits a required OpenSpec artifact, task completion record, implementation file, or declared validation evidence
- **THEN** the capability denies publication before changing GitHub

#### Scenario: Publication identity is substituted
- **WHEN** an attempt names another repository, branch, change, pull request, run, or operation identity
- **THEN** the capability denies the request before provider access and records a bounded denial receipt

#### Scenario: Human authorizes merge
- **WHEN** the user moves the Linear issue from Human Review to Merging
- **THEN** the Workflow merges only the recorded pull request at its recorded head and independently verifies that the merged commit contains the recorded work-product manifest

#### Scenario: Recorded head changed before merge
- **WHEN** the pull request head no longer matches the head confirmed for Human Review
- **THEN** automatic merge fails closed and the system does not merge an unreviewed revision
