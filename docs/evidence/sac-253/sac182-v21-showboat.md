# SAC-182 live provider readbacks

*2026-09-30T08:25:47Z by Showboat 0.6.1*
<!-- showboat-id: 13566a7f-bca0-4b08-a538-aa78f64ca4eb -->

This is a live GitHub readback for the disposable SAC-182 test pull request. Setup reviews and published app reviews are both listed. A record here proves that GitHub retained it; the separate receipt audit joins app review IDs and signed workflow events. This command alone does not prove all review scenarios passed.

```bash
rtk proxy gh api --paginate --slurp repos/sachinkundu/deos-sample-project/pulls/79/reviews --jq 'flatten | map({id, userId: .user.id, commitId: .commit_id, state, submittedAt: .submitted_at})'

```

```output
the `--slurp` option is not supported with `--jq` or `--template`

Usage:  gh api <endpoint> [flags]

Flags:
      --allow-escape-sequences   Allow printing terminal escape sequences
      --cache duration           Cache the response, e.g. "3600s", "60m", "1h"
  -F, --field key=value          Add a typed parameter in key=value format (use "@<path>" or "@-" to read value from file or stdin)
  -H, --header key:value         Add a HTTP request header in key:value format
      --hostname string          The GitHub hostname for the request (default "github.com")
  -i, --include                  Include HTTP response status line and headers in the output
      --input file               The file to use as body for the HTTP request (use "-" to read from standard input)
  -q, --jq string                Query to select values from the response using jq syntax
  -X, --method string            The HTTP method for the request (default "GET")
      --paginate                 Make additional HTTP requests to fetch all pages of results
  -p, --preview strings          Opt into GitHub API previews (names should omit '-preview')
  -f, --raw-field key=value      Add a string parameter in key=value format
      --silent                   Do not print the response body
      --slurp                    Use with "--paginate" to return an array of all pages of either JSON arrays or objects
  -t, --template string          Format JSON output using a Go template; see "gh help formatting"
      --verbose                  Include full HTTP request and response in the output
  
```

```bash
set -o pipefail
rtk proxy gh api --paginate --slurp repos/sachinkundu/deos-sample-project/pulls/79/reviews | rtk proxy jq 'flatten | map({id, userId: .user.id, commitId: .commit_id, state, submittedAt: .submitted_at})'

```

```output
[
  {
    "id": 5362834457,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T07:21:11Z"
  },
  {
    "id": 5363115734,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T07:47:22Z"
  },
  {
    "id": 5363263882,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:00:29Z"
  },
  {
    "id": 5363265424,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "CHANGES_REQUESTED",
    "submittedAt": "2026-09-30T08:00:37Z"
  },
  {
    "id": 5363555141,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "APPROVED",
    "submittedAt": "2026-09-30T08:25:22Z"
  }
]
```

```bash
set -o pipefail
rtk proxy gh api --paginate --slurp repos/sachinkundu/deos-sample-project/pulls/79/reviews | rtk proxy jq 'flatten | map({id, userId: .user.id, commitId: .commit_id, state, submittedAt: .submitted_at})'

```

```output
[
  {
    "id": 5362834457,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T07:21:11Z"
  },
  {
    "id": 5363115734,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T07:47:22Z"
  },
  {
    "id": 5363263882,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:00:29Z"
  },
  {
    "id": 5363265424,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "CHANGES_REQUESTED",
    "submittedAt": "2026-09-30T08:00:37Z"
  },
  {
    "id": 5363555141,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "APPROVED",
    "submittedAt": "2026-09-30T08:25:22Z"
  },
  {
    "id": 5363609192,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:29:52Z"
  },
  {
    "id": 5363629087,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "APPROVED",
    "submittedAt": "2026-09-30T08:31:28Z"
  },
  {
    "id": 5363673036,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:35:08Z"
  },
  {
    "id": 5363695591,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:37:06Z"
  },
  {
    "id": 5363697374,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:37:16Z"
  },
  {
    "id": 5363728006,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:39:58Z"
  },
  {
    "id": 5363748720,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:41:48Z"
  },
  {
    "id": 5363779083,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:44:23Z"
  },
  {
    "id": 5363812220,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:47:11Z"
  },
  {
    "id": 5363813720,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:47:19Z"
  },
  {
    "id": 5363859764,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:51:13Z"
  },
  {
    "id": 5363891048,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:53:54Z"
  },
  {
    "id": 5363892428,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:54:01Z"
  },
  {
    "id": 5363926816,
    "userId": 233623,
    "commitId": "d8b4a97181a564bcefaba153d32dee8c2b57edde",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T08:56:53Z"
  },
  {
    "id": 5363978326,
    "userId": 233623,
    "commitId": "e90484d32c2818a743b2b212fde61e20a04dfc11",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T09:01:14Z"
  },
  {
    "id": 5363979937,
    "userId": 233623,
    "commitId": "e90484d32c2818a743b2b212fde61e20a04dfc11",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T09:01:22Z"
  },
  {
    "id": 5364001447,
    "userId": 233623,
    "commitId": "e90484d32c2818a743b2b212fde61e20a04dfc11",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T09:03:11Z"
  },
  {
    "id": 5364057082,
    "userId": 233623,
    "commitId": "e90484d32c2818a743b2b212fde61e20a04dfc11",
    "state": "COMMENTED",
    "submittedAt": "2026-09-30T09:07:48Z"
  }
]
```
