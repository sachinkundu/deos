## Why

Real app demos need the same services and provider links as the live app. The
current test tools do not give a run one safe place for that full test, so work
such as SAC-182 can stall without strong proof.

## What Changes

- Add one shared test site for current agent work at `test-deos.voxdez.com`.
- Give the site to one run at a time. Other runs wait until cleanup makes it
  safe to use again.
- Start each lease from the version that is live on staging when the lease is
  granted. Keep that base fixed for the lease, even if staging changes.
- Keep test app data apart from staging and live data. Send each app task in the
  current team through the test site before any later release step. No special
  test label is needed. Bind test and provider records to the run and lease.
  Accept only matching signed event facts, and limit GitHub writes to the run's
  saved repository, branch, and pull request.
- Show the issue being worked as the current agent identity on the test portal.
  Also show its base and lease state in clear text.
- Before reuse, stop writes and attach safe proof to the pull request body. Read
  the body and each attached item back. Remove the run's app data, provider
  fixtures, deploy state, and secrets, then prove they are gone. A failed save
  or cleanup keeps its first error and cause and blocks the next lease.
- Use the stalled SAC-182 work as the first full test. Show its lease, base,
  issue identity on the portal, real app use, GitHub result, provider-made
  Linear event, attached pull request proof, cleanup, and free state. Keep safe
  provider and task screens, command proof, and data read-back. A direct Worker
  request is only synthetic.

### Non-goals

- Do not make the shared site a staging or live release path.
- Do not let two runs share the site or its data at the same time.
- Do not give an agent provider keys, access to live app stores, or rights to
  act on a task outside the current team or lease.
- Do not free the site until proof, removal, and absence checks pass. Do not
  keep it open after safe cleanup just to preserve proof.

## Capabilities

### New Capabilities

- `shared-test-environment`: Gives one run a staging-based test lease, safe
  provider test data, a clear portal view, cleanup, and lasting review proof.

### Modified Capabilities

None.

## Impact

This change affects test environment control, app deploys, test data, provider
access, cleanup, and the portal at `test-deos.voxdez.com`. It also adds saved
lease and base facts so a failed run can be checked and cleaned up without
putting live or staging work at risk.
