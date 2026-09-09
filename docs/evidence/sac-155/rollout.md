# SAC-155 rollout evidence

*2026-09-09T06:13:01Z by Showboat 0.6.1*
<!-- showboat-id: 6eb9495a-7746-47a8-b752-922545c474c8 -->

```bash
rtk proxy python3 scripts/inspect_portal_rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "production": {
    "deploymentId": "99c7a7f8-b46c-47f6-9302-eff15191f94e",
    "versions": [
      {
        "version_id": "df20c143-b007-4da9-9b15-e54679d5a7ab",
        "percentage": 100
      }
    ],
    "workerModuleSha256": {
      "worker.js": "01afa2e4187d2da2ea0228662a3d1d019606d24258ec9d6b30e7b29e37bf0492"
    },
    "sharedBindings": [
      {
        "bucket_name": "deos-sample-project-artifacts",
        "name": "ARTIFACTS",
        "type": "r2_bucket"
      },
      {
        "database_id": "4e854f8a-018a-42c4-a325-c4b8805c06b2",
        "id": "4e854f8a-018a-42c4-a325-c4b8805c06b2",
        "name": "DB",
        "type": "d1"
      },
      {
        "environment": "production",
        "name": "RETRY_ADMIN",
        "service": "deos-queue-consumer-ts",
        "type": "service"
      },
      {
        "entrypoint": "RouteAdmin",
        "environment": "production",
        "name": "ROUTE_ADMIN",
        "service": "deos-queue-consumer-ts",
        "type": "service"
      }
    ]
  },
  "releaseSha": "6018ea33d2bba472b717e6fb6a4a8554fef92207",
  "githubEnvironments": [
    {
      "name": "staging",
      "protectionTypes": [
        "branch_policy"
      ],
      "branches": [
        {
          "name": "main",
          "type": "branch"
        }
      ],
      "secretNames": []
    },
    {
      "name": "production",
      "protectionTypes": [
        "required_reviewers",
        "branch_policy"
      ],
      "branches": [
        {
          "name": "main",
          "type": "branch"
        }
      ],
      "secretNames": []
    }
  ]
}
```

## Production source baseline

Commit `6018ea33d2bba472b717e6fb6a4a8554fef92207` contains main plus the four existing portal edits from the original checkout. The edits were copied to an isolated worktree; the original files were left untouched. The baseline passed 66 portal tests and portal type-checking.

The existing authenticated production browser was reloaded. Network response bodies for the JavaScript and CSS were hashed in the browser session. Their SHA-256 values matched the canonical local build:

| File | SHA-256 |
| --- | --- |
| `index-DFjO_Enz.js` | `e17338f3670c2e5b6da54528df158d043bec97f7f03d25a06fd02037e30e3110` |
| `index-lLbj5z6x.css` | `7ab47f22a0e0851b616053faebcabe58dbea04e0482d9848f20e81b2dc22db6a` |
| `worker.js` | `01afa2e4187d2da2ea0228662a3d1d019606d24258ec9d6b30e7b29e37bf0492` |

The Worker hash compares a local Wrangler dry run with the script downloaded through the Cloudflare API. The asset hashes are browser observations recorded here, not output from the read-back command above. Together they establish the source baseline before initializing release. No Worker deployment was performed.

The updated implementation includes this baseline and passed 69 portal tests, 16 release tests, portal type-checking, both canonical portal builds, Python lint, and strict OpenSpec validation. Live staging and release verification remain pending.

## Owner-managed Access setup

The owner added staging to the existing DEOS Workflow Portal Access application. Browser inspection confirmed the displayed destinations deos.voxdez.com, bettaview.voxdez.com, and deos-staging.voxdez.com, with the existing Allow Sachin only policy. A configuration screenshot was captured in the Codex conversation.

GitHub read-back confirms both staging and production have PORTAL_ACCESS_CLIENT_ID as an environment variable and PORTAL_ACCESS_CLIENT_SECRET as an environment secret. Only entry names were inspected; the secret values were not read or printed. The workflows now match this storage. The version-path Service Auth policy, deployment credentials, and staging retry secret remain pending.

```bash
rtk proxy python3 scripts/inspect_portal_rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "production": {
    "deploymentId": "99c7a7f8-b46c-47f6-9302-eff15191f94e",
    "versions": [
      {
        "version_id": "df20c143-b007-4da9-9b15-e54679d5a7ab",
        "percentage": 100
      }
    ],
    "workerModuleSha256": {
      "worker.js": "01afa2e4187d2da2ea0228662a3d1d019606d24258ec9d6b30e7b29e37bf0492"
    },
    "sharedBindings": [
      {
        "bucket_name": "deos-sample-project-artifacts",
        "name": "ARTIFACTS",
        "type": "r2_bucket"
      },
      {
        "database_id": "4e854f8a-018a-42c4-a325-c4b8805c06b2",
        "id": "4e854f8a-018a-42c4-a325-c4b8805c06b2",
        "name": "DB",
        "type": "d1"
      },
      {
        "environment": "production",
        "name": "RETRY_ADMIN",
        "service": "deos-queue-consumer-ts",
        "type": "service"
      },
      {
        "entrypoint": "RouteAdmin",
        "environment": "production",
        "name": "ROUTE_ADMIN",
        "service": "deos-queue-consumer-ts",
        "type": "service"
      }
    ]
  },
  "releaseSha": "6018ea33d2bba472b717e6fb6a4a8554fef92207",
  "githubEnvironments": [
    {
      "name": "staging",
      "protectionTypes": [
        "branch_policy"
      ],
      "branches": [
        {
          "name": "main",
          "type": "branch"
        }
      ],
      "secretNames": [
        "PORTAL_ACCESS_CLIENT_SECRET"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    },
    {
      "name": "production",
      "protectionTypes": [
        "required_reviewers",
        "branch_policy"
      ],
      "branches": [
        {
          "name": "main",
          "type": "branch"
        }
      ],
      "secretNames": [
        "PORTAL_ACCESS_CLIENT_SECRET"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    }
  ]
}
```

## Version-path Access application

The owner created DEOS portal version checks and corrected its second hostname. Browser inspection of the saved configuration confirms deos.voxdez.com/api/version and deos-staging.voxdez.com/api/version. The attached Allow deployment probe policy uses Service Auth and one Include rule selecting the DEOS portal deployment probe service token.

This is configuration evidence. Authentication from GitHub and live deployment checks remain pending. GitHub checks for implementation revision d87152d passed in both Python versions and TypeScript.
