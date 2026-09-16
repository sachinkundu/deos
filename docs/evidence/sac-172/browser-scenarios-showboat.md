# SAC-172 isolated browser scenarios

*2026-09-16T10:45:08Z by Showboat 0.6.1*
<!-- showboat-id: 97ab44d4-6745-4ae7-bc11-f5e1ea969a95 -->

```bash
rtk proxy node /tmp/sac172-scenarios-probe/request.mjs

```

```output
{
  "sessionId": "71f1eafc-78ed-45fc-83d1-db82d4286fdf",
  "starts": [
    {
      "value": "0",
      "local": null,
      "session": null,
      "cookie": "",
      "pages": 1,
      "contexts": 2
    },
    {
      "value": "0",
      "local": null,
      "session": null,
      "cookie": "",
      "pages": 1,
      "contexts": 2
    },
    {
      "value": "0",
      "local": null,
      "session": null,
      "cookie": "",
      "pages": 1,
      "contexts": 2
    },
    {
      "value": "0",
      "local": null,
      "session": null,
      "cookie": "",
      "pages": 1,
      "contexts": 2
    },
    {
      "value": "0",
      "local": null,
      "session": null,
      "cookie": "",
      "pages": 1,
      "contexts": 2
    }
  ],
  "captures": [
    {
      "scenario": "one",
      "value": "1",
      "sha256": "fae3afbef35a8dd521a318f75252b03d521e9e682d8832256798501113393185",
      "bytes": 12140
    },
    {
      "scenario": "two",
      "value": "2",
      "sha256": "d37acd7dec23f1469fc06fb7539ef389983cd296a45727c0b8125cd5aa79b0fa",
      "bytes": 12255
    },
    {
      "scenario": "one-again",
      "value": "1",
      "sha256": "fae3afbef35a8dd521a318f75252b03d521e9e682d8832256798501113393185",
      "bytes": 12140
    }
  ],
  "failed": {
    "message": "Demo failure stopped at step 2: No element found for selector: #does-not-exist",
    "cause": "No element found for selector: #does-not-exist"
  },
  "recovered": [
    "1"
  ],
  "selected": [
    "Counter after 1 clicks"
  ]
}
```
