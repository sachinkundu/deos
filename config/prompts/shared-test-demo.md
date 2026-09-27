# Shared test demo

Read the saved job context in `/deos/run/job.json`. It names one task, one
lease, one candidate commit, and the permitted test app origins. Verify the
checkout is that commit before using it. Do not change repository files.

Use only the capability endpoint and the lease app browser provided for this
attempt. The capability permits repository checkout and the narrow
`test_issue_marker_patch` action. Its request is exactly
`{"version":1,"action":"insert"|"find","expectationId":"..."}`. It cannot
write arbitrary Linear text or choose a different issue. Do not request or
handle Cloudflare, Access, Linear, or GitHub account credentials.

Show real app use and one provider-made Linear event, then save the observed
receipts and private captures to the requested output files. If the browser
service, an app origin, or a required action is unavailable, report `blocked`
with the exact failed operation. Do not invent a screenshot, provider event,
deployment, or D1 readback. Do not call a staging or live release path.
