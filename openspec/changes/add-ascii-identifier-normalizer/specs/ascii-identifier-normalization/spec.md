## ADDED Requirements

### Requirement: Normalize an ASCII identifier deterministically

The package SHALL expose a small importable Python function that accepts an ASCII string and returns its normalized form. The function SHALL trim surrounding ASCII whitespace, convert ASCII letters `A` through `Z` to lowercase, and replace each maximal non-empty interior run composed of ASCII space characters and underscores with one hyphen. It SHALL preserve every other ASCII character and SHALL reject input containing a non-ASCII character.

#### Scenario: Normalize case and separators

- **WHEN** the function receives `"  Release__ Candidate _V1  "`
- **THEN** it returns `"release-candidate-v1"`

#### Scenario: Preserve other ASCII characters

- **WHEN** the function receives `" API.v2/Beta-1 "`
- **THEN** it returns `"api.v2/beta-1"`

#### Scenario: Reject non-ASCII input

- **WHEN** the function receives a string containing any non-ASCII character
- **THEN** it raises a documented Python exception instead of transliterating or silently removing that character

### Requirement: Verify normalization without external effects

The normalization contract SHALL have deterministic pytest coverage that imports and exercises the public function without network access, provider access, deployment, persistence, production data, or third-party runtime dependencies.

#### Scenario: Run focused tests offline

- **WHEN** the normalization test module runs in the repository's Python test environment
- **THEN** it verifies trimming, ASCII lowercasing, separator-run replacement, preservation of other ASCII characters, and rejection of non-ASCII input without an external effect
