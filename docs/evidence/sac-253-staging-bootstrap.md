# SAC-253 staging bootstrap remote read-back

*2026-09-25T07:48:08Z by Showboat 0.6.1*
<!-- showboat-id: 5f9e9b9c-a559-42fb-aea0-3c5f2e124fcd -->

Read-only D1 state after migration 0055. The site remains free and the staging release pointer is uninitialized until both staging Workers are live.

```bash
python3 scripts/check_shared_test_bootstrap.py
```

```output
{"activeAttempts": {"count": 0}, "migration": {"name": "0055_shared_test_environment.sql"}, "pointer": {"manifest_id": null, "revision": 0, "state": "uninitialized"}, "site": {"fence": 0, "owner_lease_id": null, "owner_run_id": null, "state": "free"}}
```

## Access configuration read-back

On 2026-09-25, the existing [DEOS portal version checks Access application](https://dash.cloudflare.com/c68856288112af7698f5be52ea94b96e/one/access-controls/apps/self-hosted/bbc3df50-d8af-4492-ad3d-08cfa65da764/edit) was saved and reopened. Its only destinations are `deos.voxdez.com/api/version`, `deos-staging.voxdez.com/api/version`, and `bettaview-staging.voxdez.com/api/version`. The first two were already present; the BettaView staging path was added. No hostname-wide access was added. [Destination screenshot](sac-253-access-destinations.png).

The app has the existing [Service Auth policy](https://dash.cloudflare.com/c68856288112af7698f5be52ea94b96e/one/access-controls/policies/5622b486-903f-4c1b-95ed-09efbcadbbaa/edit), whose sole Include selector is the enabled `DEOS portal deployment probe` service token, and a new [owner policy](https://dash.cloudflare.com/c68856288112af7698f5be52ea94b96e/one/access-controls/policies/d4469648-fad2-416f-a62d-741f5ac02587/edit) with Include `sachinkundu@gmail.com` and Require Google login. Both were read back after saving. [Policy screenshot](sac-253-access-policies.png).

This proves saved Access configuration, not a successful service-token request to either live staging Worker. The BettaView staging Worker and hostname are created by the staging deployment after this PR merges, then its `/api/version` response must be checked with the GitHub staging environment token.
