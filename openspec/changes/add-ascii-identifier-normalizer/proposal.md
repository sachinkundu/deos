## Why

Callers need one deterministic, dependency-free way to canonicalize ASCII identifiers before comparing or storing them.

## What Changes

- Add a small importable Python function that trims surrounding ASCII whitespace, lowercases ASCII letters, and replaces each non-empty run of ASCII spaces and underscores with one hyphen.
- Preserve all other ASCII characters and define non-ASCII input as invalid.
- Cover the normalization contract with deterministic pytest cases that require no network, provider, deployment, or other external effect.

### Non-goals

- Transliteration, Unicode normalization, or locale-sensitive casing.
- Validation of an application-specific identifier grammar beyond the ASCII boundary.
- Changing existing workflow, provider, persistence, or deployment behavior.

## Capabilities

### New Capabilities

- `ascii-identifier-normalization`: Deterministically canonicalize an ASCII identifier through a small Python API.

### Modified Capabilities

None.

## Impact

- Adds one dependency-free Python utility under the importable `deos` package and focused pytest coverage.
- Has no network, provider, persistence, deployment, or production-data effects.

