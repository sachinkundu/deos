## Why

People who watch a workflow must now apply each new update by hand. They need an option that keeps the view current while still letting them choose the manual flow.

## What Changes

- Add a Live updates setting that people can turn on or off.
- Apply new confirmed workflow data at once when live updates are on.
- Keep the current **Apply update** flow when live updates are off.
- Save the choice only in the current browser, not in D1, and use it after the portal is opened again.

### Non-goals

- Change the current poll timing or the rules that mark data as confirmed.
- Write to issue state, workflow state, or data in the workflow service.
- Store or sync the choice outside the current browser.

## Capabilities

### New Capabilities

- `portal-live-updates`: Lets each browser save a live update choice and controls whether confirmed workflow data is applied at once or by hand.

### Modified Capabilities

None.

## Impact

This change affects the DEOS workflow portal, its Settings page, browser storage, and portal tests. It does not add an API or change server data.
