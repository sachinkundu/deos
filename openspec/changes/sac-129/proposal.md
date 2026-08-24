## Why

The project needs a small tool to test its plan flow. Users can also use the tool for quick math and unit changes.

## What Changes

- Add a terminal tool for basic math.
- Add heat and angle unit changes in both ways.
- Show a clear error for bad input, with no crash.
- Run one task at a time. The scope does not include a prompt loop, saved work, or hard math.

## Capabilities

### New Capabilities

- `calculator-cli`: Sets the math, unit change, result, and error rules for the tool.

### Modified Capabilities

None.

## Impact

This adds a local tool and its tests. It does not change the work service, data stores, provider links, or release setup.
