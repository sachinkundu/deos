# SAC-225 browser eviction and saved-work recovery

*2026-09-15T22:03:12Z by Showboat 0.6.1*
<!-- showboat-id: fcbcc75c-e581-4027-b95a-965123d22bfa -->

The provider history identifies BrowserSessionEvicted (reason 11), ending at 2026-09-15T21:01:53.435Z. This supersedes the earlier unproven idle-timeout suspicion. Cloudflare documents eviction as infrastructure maintenance or a new release, not application code: https://developers.cloudflare.com/browser-run/reference/browser-close-reasons/. The specific maintenance event is not exposed by this receipt.

The direct REST read returned HTTP 401 with the available token. A local Wrangler dev Worker with a remote Browser binding successfully read puppeteer.history(). It created no browser and made no production deployment. The probe source is saved alongside this document. Its local config used compatibility_date 2026-08-26, nodejs_compat, BROWSER with remote:true, account c68856288112af7698f5be52ea94b96e, and localhost port 8819. The following request executes that live read; it is not a fixture or a replay of saved JSON.

```bash
rtk proxy curl --silent --show-error --fail --max-time 20 http://127.0.0.1:8819/

```

```output
{"history":[{"sessionId":"697c2466-cb97-45c6-8e2c-764e226d0d0f","startTime":1789504994307,"endTime":1789506113435,"closeReason":11,"closeReasonText":"BrowserSessionEvicted"}],"total":4}```
```

The collected implementation candidate, cumulative patch, diagnostics, transcript, result and validation were downloaded from R2 and checked against their D1 SHA-256 hashes. Artifact identities are in sac-225-browser-eviction-artifacts.json. The candidate tree is 8eb184220d08673abb7564089d72420f2dd54eb5; patch SHA is 4186436ba4ee6d86b2e2d2d6c1a2e8c5cd52325344881868943a45c32c37ccec. Its final-tree checks include build, 24 unit cases, 16 desktop/320px browser cases, 2 evidence cases, and the workerd 404-to-200 recovery check. Assigned-browser images on that final tree remain missing, so this is not demo acceptance.

The user authorized automatic intermediate gates for this canary. A reply to the saved clarification was posted through Linear MCP at 22:02:33.570Z. The real signed Comment.create delivery was processed at 22:03:07.570Z and moved the unchanged v30 workflow from clarification visit33 to Demo Plan visit34. The new Claude attempt is running. This repeat Demo Plan is the frozen workflow continuation after a clarification, not an operator-forced rerun. The final implementation PR remains a human gate. No backend, container, portal or production deployment was needed.

The temporary read-only probe was stopped after this evidence was captured. The exact reason is provider eviction, not BrowserIdle. Keep-alive alone cannot prevent provider infrastructure eviction. The existing fresh-try continuation remains the recovery path; no second browser was created inside the old try. The app must still recapture final-tree visuals and pass its independent Demo Gate.
