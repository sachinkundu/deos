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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_STAGING_CLOUDFLARE_API_TOKEN"
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    }
  ]
}
```

```bash
rtk proxy python3 scripts/inspect_portal_rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "production": {
    "deploymentId": "f06ddb2c-2c23-4161-8bca-2f8a2fd8fe69",
    "versions": [
      {
        "version_id": "a3e925cc-3b26-46d0-8fc5-b7602eb3f4d9",
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_STAGING_CLOUDFLARE_API_TOKEN"
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    }
  ]
}
```

## Shared retry secret replacement

The owner approved replacement on 2026-09-09. Cloudflare reported zero running DEOS Workflows. The two D1 rows still marked active map to provider instances that had already errored; no workflow was resumed.

One new value was installed on deos-queue-consumer-ts, deos-workflow-portal, and deos-workflow-portal-staging. It is retained in the ignored local .env with owner-only permissions. No value was printed or stored in GitHub.

The read-back above records production version a3e925cc-3b26-46d0-8fc5-b7602eb3f4d9 at 100 percent. Its Worker hash still matches the verified baseline. A separate before/after API comparison confirmed every backend and portal module hash and runtime setting stayed unchanged; the deployment annotations now identify the secret change. Backend version 0331c8c9-98ba-44c6-8783-1edfb15a5b9e is active at 100 percent. Its container configuration and image digest 39c3bc98bfbd51f6da275b0c8470b79317fcc53efb71bd3ec8422df57a948053 are unchanged.

The staging placeholder has version 09ac1352-a5d1-4f73-9383-7acc81fdea09, with only STAGE_RETRY_SECRET installed. It has no data bindings or public targets. Both workers.dev and preview URLs are disabled. This does not count as the first staging application deployment.

The production browser was reloaded and still rendered the SAC-155 workflow and current records. A direct backend authentication probe received HTTP 403 before an application response could be verified. No retry or recovery was triggered. Portal-to-backend retry authentication and the main-only staging rollout still need live proof.

## First main-triggered staging run

PR #93 merged with the owner's approval as c02de5f3d3f0bb1825b5eec0e4dcbee9d8ea0840. This preserved the verified release baseline in main's ancestry. GitHub run 34324212520 was triggered by that push.

Tests and builds passed. The first Worker service lookup failed with Cloudflare authentication error 10000 before upload. Browser inspection found the account-level Worker and R2 permissions inside a Specified Domains policy for voxdez.com. The setup guide now requires a separate Entire Account policy for those two permissions and a domain policy containing only Zone Read.

The owner was asked to correct the existing token policies, keeping the token values and GitHub secrets. This is an outstanding provider configuration step. The read-back below confirms that production and the staging placeholder stayed unchanged.

```bash
rtk proxy gh run view 34324212520 --repo sachinkundu/deos --json headSha,event,status,conclusion,url
```

```output
{"conclusion":"failure","event":"push","headSha":"c02de5f3d3f0bb1825b5eec0e4dcbee9d8ea0840","status":"completed","url":"https://github.com/sachinkundu/deos/actions/runs/34324212520"}
```

```bash
rtk proxy python3 scripts/inspect_portal_rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "production": {
    "deploymentId": "f06ddb2c-2c23-4161-8bca-2f8a2fd8fe69",
    "versions": [
      {
        "version_id": "a3e925cc-3b26-46d0-8fc5-b7602eb3f4d9",
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_STAGING_CLOUDFLARE_API_TOKEN"
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    }
  ]
}
```

## Partial staging deployment and audit repair

Staging attempt 2 uploaded the main commit but failed on the zone route lookup before attaching the Custom Domain. Production remains on its prior version. The follow-up checks route read access before upload and records provider and hostname read-backs independently.

The inventory audit had mismatched shared credentials and then exceeded its 100-ID request limit. The shared credential was replaced in the queue Worker and both existing GitHub repository entries. Provider read-back confirmed identical backend modules, settings, and container configuration. The client now submits batches of at most 100 IDs. The following GitHub run used the real provider inventory; each accepted batch reported zero cleanup findings. The separate Containers Read API-token replacement is still pending in GitHub.

```bash
rtk proxy python3 - <<'PYREAD'
import json,re,subprocess
run='34329098195'
state=json.loads(subprocess.check_output(['gh','run','view',run,'--repo','sachinkundu/deos','--json','url,headSha,status,conclusion'],text=True))
log=subprocess.check_output(['gh','run','view',run,'--repo','sachinkundu/deos','--log'],text=True)
state['acceptedBatches']=[json.loads(match.group(0)) for line in log.splitlines() if (match:=re.search(r'\{"version":1,"reported":\d+\}',line))]
print(json.dumps(state,indent=2))
PYREAD
```

```output
{
  "conclusion": "success",
  "headSha": "9f29b9eb960bbfec9fbf7bbbaf76b707b31ae515",
  "status": "completed",
  "url": "https://github.com/sachinkundu/deos/actions/runs/34329098195",
  "acceptedBatches": [
    {
      "version": 1,
      "reported": 0
    },
    {
      "version": 1,
      "reported": 0
    }
  ]
}
```

```bash
rtk proxy python3 scripts/inspect_portal_rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "production": {
    "deploymentId": "f06ddb2c-2c23-4161-8bca-2f8a2fd8fe69",
    "versions": [
      {
        "version_id": "a3e925cc-3b26-46d0-8fc5-b7602eb3f4d9",
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
  "staging": {
    "deploymentId": "b26e755d-521c-4e84-9999-79e108d08fc9",
    "versions": [
      {
        "version_id": "1d96d46f-9a14-4b58-9840-7923dd8b94c6",
        "percentage": 100
      }
    ],
    "bindings": [
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
        "name": "PORTAL_CANONICAL_HOST",
        "text": "deos-staging.voxdez.com",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SITE",
        "text": "Staging",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SOURCE_BRANCH",
        "text": "main",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SOURCE_SHA",
        "text": "c02de5f3d3f0bb1825b5eec0e4dcbee9d8ea0840",
        "type": "plain_text"
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
  "portalDomains": [
    {
      "hostname": "deos.voxdez.com",
      "service": "deos-workflow-portal",
      "enabled": true,
      "previews_enabled": false
    }
  ],
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_STAGING_CLOUDFLARE_API_TOKEN"
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    }
  ]
}
```

Staging run 34331133748 deployed main f89391e58ef012fcbf64fe07c694d00519b47a5d and attached its Custom Domain. The second attempt activated version 5e6600ca-f04b-4ba2-b556-63299cdbb4e3 at 100 percent, deployment 7c9d31a0-8ed9-4a4e-a279-c264fbfc39d4. The browser loaded the Staging label and the same SAC-155 run as production. The automated host probe failed with HTTP 403. A real unauthenticated probe isolated error 1010 for the default Python client; the explicit DEOS-Portal-Release/1.0 client reached the Access denial page instead. Both GitHub client IDs match the enabled Cloudflare service token. Production remains on a3e925cc-3b26-46d0-8fc5-b7602eb3f4d9. The repository inventory credential currently verifies as the production deployment token; the owner has been asked to replace it with DEOS Inventory Cleanup. No secret values were logged.

```bash
rtk proxy python3 scripts/inspect_portal_rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "production": {
    "deploymentId": "f06ddb2c-2c23-4161-8bca-2f8a2fd8fe69",
    "versions": [
      {
        "version_id": "a3e925cc-3b26-46d0-8fc5-b7602eb3f4d9",
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
  "staging": {
    "deploymentId": "7c9d31a0-8ed9-4a4e-a279-c264fbfc39d4",
    "versions": [
      {
        "version_id": "5e6600ca-f04b-4ba2-b556-63299cdbb4e3",
        "percentage": 100
      }
    ],
    "bindings": [
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
        "name": "PORTAL_CANONICAL_HOST",
        "text": "deos-staging.voxdez.com",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SITE",
        "text": "Staging",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SOURCE_BRANCH",
        "text": "main",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SOURCE_SHA",
        "text": "f89391e58ef012fcbf64fe07c694d00519b47a5d",
        "type": "plain_text"
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
  "portalDomains": [
    {
      "hostname": "deos.voxdez.com",
      "service": "deos-workflow-portal",
      "enabled": true,
      "previews_enabled": false
    },
    {
      "hostname": "deos-staging.voxdez.com",
      "service": "deos-workflow-portal-staging",
      "enabled": true,
      "previews_enabled": false
    }
  ],
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_STAGING_CLOUDFLARE_API_TOKEN"
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    }
  ]
}
```

PR #95 merged as f7c997276030dc1c5b5e7520d5227e89c78d6ed0 after all CI checks passed. GitHub staging run 34332992168 then passed its full deployment and authenticated host verification using the existing Access service credential. No Access credential or Cloudflare security setting changed. Browser inspection also confirmed the Staging settings page reads the existing repository routes through RouteAdmin without changing them. Production remains at its baseline; the inventory repository token replacement is still pending.

```bash
rtk proxy gh run view 34332992168 --repo sachinkundu/deos --json conclusion,headSha,url,updatedAt
```

```output
{"conclusion":"success","headSha":"f7c997276030dc1c5b5e7520d5227e89c78d6ed0","updatedAt":"2026-09-09T09:08:58Z","url":"https://github.com/sachinkundu/deos/actions/runs/34332992168"}
```

```bash
rtk proxy python3 scripts/inspect_portal_rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "production": {
    "deploymentId": "f06ddb2c-2c23-4161-8bca-2f8a2fd8fe69",
    "versions": [
      {
        "version_id": "a3e925cc-3b26-46d0-8fc5-b7602eb3f4d9",
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
  "staging": {
    "deploymentId": "88ddcb13-3990-4922-8d61-5984dbbff380",
    "versions": [
      {
        "version_id": "b5e10830-0f34-4e20-8f40-071a4114cb29",
        "percentage": 100
      }
    ],
    "bindings": [
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
        "name": "PORTAL_CANONICAL_HOST",
        "text": "deos-staging.voxdez.com",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SITE",
        "text": "Staging",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SOURCE_BRANCH",
        "text": "main",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SOURCE_SHA",
        "text": "f7c997276030dc1c5b5e7520d5227e89c78d6ed0",
        "type": "plain_text"
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
  "portalDomains": [
    {
      "hostname": "deos.voxdez.com",
      "service": "deos-workflow-portal",
      "enabled": true,
      "previews_enabled": false
    },
    {
      "hostname": "deos-staging.voxdez.com",
      "service": "deos-workflow-portal-staging",
      "enabled": true,
      "previews_enabled": false
    }
  ],
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_STAGING_CLOUDFLARE_API_TOKEN"
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    }
  ]
}
```

```bash
rtk proxy gh run view 34335314618 --repo sachinkundu/deos --json conclusion,headSha,url,updatedAt
```

```output
{"conclusion":"success","headSha":"f7c997276030dc1c5b5e7520d5227e89c78d6ed0","updatedAt":"2026-09-09T09:33:19Z","url":"https://github.com/sachinkundu/deos/actions/runs/34335314618"}
```

The owner updated the repository CLOUDFLARE_API_TOKEN at 2026-09-09T09:32:06Z. GitHub audit run 34335314618 then read provider inventory and submitted both batches successfully, with zero reports. Production run 34335399832 was dispatched for the exact staging-verified SHA f7c997276030dc1c5b5e7520d5227e89c78d6ed0. It reached the existing production required-reviewer gate; no promotion or production upload has run yet.

```bash
rtk proxy gh run view 34335399832 --repo sachinkundu/deos --json conclusion,headSha,url,updatedAt
```

```output
{"conclusion":"success","headSha":"f7c997276030dc1c5b5e7520d5227e89c78d6ed0","updatedAt":"2026-09-09T09:49:29Z","url":"https://github.com/sachinkundu/deos/actions/runs/34335399832"}
```

The owner approved the production environment in GitHub. Release run 34335399832 succeeded for f7c997276030dc1c5b5e7520d5227e89c78d6ed0. It promoted release and deployed production version 8060f8e0-afca-45d0-bc29-c37e65918639 at 100 percent, deployment d7c12887-8982-41a1-9530-ec41a0aea84e. The authenticated hostname returned the matching Production identity, release branch, SHA, and version. The browser shows the Production label and the same SAC-155 run. The backend and BettaView deployments match the saved before-state. The later main-only change adds a portal README and exposes production source metadata in the read-only inspector so the separation can be checked directly.

```bash
rtk proxy python3 scripts/inspect_portal_rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "production": {
    "deploymentId": "d7c12887-8982-41a1-9530-ec41a0aea84e",
    "versions": [
      {
        "version_id": "8060f8e0-afca-45d0-bc29-c37e65918639",
        "percentage": 100
      }
    ],
    "workerModuleSha256": {
      "worker.js": "d3f673dc9eb21225b0094f0d973529df2100935a1aa5d211f7b0a20a1ae33030"
    },
    "sourceMetadata": {
      "PORTAL_CANONICAL_HOST": "deos.voxdez.com",
      "PORTAL_SITE": "Production",
      "PORTAL_SOURCE_BRANCH": "release",
      "PORTAL_SOURCE_SHA": "f7c997276030dc1c5b5e7520d5227e89c78d6ed0"
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
  "staging": {
    "deploymentId": "88ddcb13-3990-4922-8d61-5984dbbff380",
    "versions": [
      {
        "version_id": "b5e10830-0f34-4e20-8f40-071a4114cb29",
        "percentage": 100
      }
    ],
    "bindings": [
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
        "name": "PORTAL_CANONICAL_HOST",
        "text": "deos-staging.voxdez.com",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SITE",
        "text": "Staging",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SOURCE_BRANCH",
        "text": "main",
        "type": "plain_text"
      },
      {
        "name": "PORTAL_SOURCE_SHA",
        "text": "f7c997276030dc1c5b5e7520d5227e89c78d6ed0",
        "type": "plain_text"
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
  "portalDomains": [
    {
      "hostname": "deos-staging.voxdez.com",
      "service": "deos-workflow-portal-staging",
      "enabled": true,
      "previews_enabled": false
    },
    {
      "hostname": "deos.voxdez.com",
      "service": "deos-workflow-portal",
      "enabled": true,
      "previews_enabled": false
    }
  ],
  "releaseSha": "f7c997276030dc1c5b5e7520d5227e89c78d6ed0",
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_STAGING_CLOUDFLARE_API_TOKEN"
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
        "PORTAL_ACCESS_CLIENT_SECRET",
        "PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN"
      ],
      "variableNames": [
        "PORTAL_ACCESS_CLIENT_ID"
      ]
    }
  ]
}
```
