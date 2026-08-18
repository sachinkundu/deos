## Why

Callers need one small, deterministic way to canonicalize ASCII identifiers so equivalent values do not diverge because of case, surrounding whitespace, or separator style.

## What Changes

- Add an importable Python function that trims surrounding whitespace, lowercases ASCII letters, and replaces each non-empty run of spaces or underscores with one hyphen.
- Add deterministic pytest coverage for the normalization rules and their combinations.
- Keep the utility dependency-free.
- Non-goals: Unicode normalization, punctuation rewriting, validation, or integration with workflow behavior.

## Capabilities

### New Capabilities

- `ascii-identifier-normalization`: Defines deterministic normalization of ASCII identifiers through an importable Python API.

### Modified Capabilities

None.

## Impact

Adds a small Python utility module and its pytest coverage. No external API, service, dependency, deployment, or production data is affected.
