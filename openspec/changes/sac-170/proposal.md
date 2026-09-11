## Why

Plan and design reviews now repeat work after edits. Review logs can also fail to open, and agents lack the current sources and project context they need.

## What Changes

- For the first plan and design draft, run one self-review in the live author step. If it finds issues, let the author fix them once. Then run one closed check of the same issue set. The check cannot add issues. Keep any open issues for the person who reviews the work.
- Run one independent review after the first plan or design is posted. Let the author respond and fix the work as needed, but do not run that review again. A person may ask for more edits as often as needed. Those edits go back to the same human gate after checks and read-back, with no new semantic review. Human approval is still required.
- Give every plan and design author, self-reviewer, and independent reviewer web search. Make them cite the current source pages they use. Give the design author the checked plan and the project architecture files. Give each role pinned Cloudflare skills and other safe skills that fit its work. Skills and web search do not add write rights.
- Show self-review as part of the author step in the portal. Keep each review result, response, source, and open issue clear. Make **View transcript** open useful logs. For an old empty log, show a clear empty state instead of an error.
- Put the new rules in a new fixed flow version. A run keeps the flow version it had at start.

### Non-goals

- Do not change the author or reviewer model route in this change.
- Do not let any agent approve or merge plan or design work.
- Do not grant GitHub, Linear, repo write, or secret access through search or skills.
- Do not alter the saved graph or proof for an old run.

## Capabilities

### New Capabilities

- `openspec-review-flow`: Runs one bounded self-review and one independent review for each first plan and design draft, then sends later edits back to people without more semantic review.
- `grounded-openspec-agents`: Gives plan and design roles current web sources, checked project context, citations, and safe task skills.

### Modified Capabilities

- `simplified-planning-workflow`: Selects the new review cycle for new runs while old runs keep their fixed graph.
- `workflow-observability`: Nests self-review under the author step and makes review transcripts and old empty logs clear.

## Impact

This change affects the fixed workflow graph, author and review jobs, review proof, source records, skill bundles, and the portal. It also affects checks for plan and design review rounds. Provider write rules and human gates stay the same.
