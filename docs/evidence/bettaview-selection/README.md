# BettaView selection matching

PR #133 was still at `4832e48631c87f1072b5aa78e4a1e7305c31d69f`, the same head
shown in the user's open tab. Eleven unpublished comments remained in that tab.
The operator did not reload it or publish the user's review.

The browser previously accepted a selection using first/last word windows. The
server required a contiguous raw-source word sequence. A Markdown link followed
by more prose broke that sequence because its hidden URL appeared in the source.
The error incorrectly claimed the source had changed.

GitHub's live Markdown renderer supplied 127 paragraphs, headings and list items
from the exact PR source. The old matcher rejected the paragraphs at lines 208–215
and 217–223. The new shared matcher accepted all 127. The two failures are retained
as regression fixtures. Both server implementations and the browser now use that
same matcher. Source positions come from a GFM parser; unknown and ambiguous
selections still report an error, retaining the comment. Publication errors name
the comment and source location and preserve their original cause.

Validation: all 109 BettaView tests pass, the production frontend builds, and the
two actual failing paragraphs resolve correctly in a local workerd instance built
by Wrangler. This is provider-rendered input and local runtime proof, not proof
that the user's eleven-comment review was submitted.

Cloudflare readback confirms version `15a6791d-3618-4a02-b231-15db71fb59c6` at
100% traffic, deployed 2026-09-14T05:27:34.519742Z. Wrangler then failed its route
listing with authentication error 10000; deployment had already activated. The
existing production domain was verified separately in a fresh browser tab. No
route change was needed. The old tab can use the new server without a reload.
