# SAC-253 GitHub PR body contract

On 2026-09-25, draft PR [#150](https://github.com/sachinkundu/deos/pull/150) was used to check the real GitHub REST contract. A GET returned an ETag. A PATCH with `If-Match` returned HTTP 400: `Conditional request headers are not allowed in unsafe requests unless supported by the endpoint`. The same PATCH without `If-Match` returned HTTP 200. A fresh GET showed the exact added marker, and a second PATCH removed only that marker. A final GET matched the original body exactly.

The coordinator must therefore serialize its own PR body writes in D1, merge from a fresh GET, and read back the saved body and attachments. The GET ETag cannot be used as a PATCH precondition on this endpoint.
