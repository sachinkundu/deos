# Cloudflare preview readiness and cleanup

*2026-09-15T13:39:58Z by Showboat 0.6.1*
<!-- showboat-id: b425e02e-c1b1-4cde-bc89-1ded20a88a8f -->

This private probe uses its own Cloudflare Sandbox and harmless preview page. It checks the deployed readiness helper on the already allocated public tunnel, then destroys that Sandbox. This is preview transport proof; SAC-182 application and provider behavior still require the full canary. The original startup DNS error and helper invocation error are retained as separate receipts.

```bash
rtk proxy python3 /tmp/sac172-operator-command.py node /tmp/sac172-demo-preview-probe/call.mjs ready /tmp/sac172-demo-preview-probe/showboat-ready.json
```

```output
⎔ Establishing remote connection...
{"sandbox":"sac172demoreadiness20260915","tunnel":{"id":"quick-bbq860943wnt5sxcvsbr","port":8787,"url":"https://collected-twisted-wisconsin-fixed.trycloudflare.com","hostname":"collected-twisted-wisconsin-fixed.trycloudflare.com","createdAt":"2026-09-15T13:36:25.263Z"},"readiness":[{"at":"2026-09-15T13:40:09.177Z","status":200}]}
```

```bash
rtk proxy python3 /tmp/sac172-operator-command.py node /tmp/sac172-demo-preview-probe/call.mjs cleanup /tmp/sac172-demo-preview-probe/readiness-cleanup.json
```

```output
⎔ Establishing remote connection...
{"sandbox":"sac172demoreadiness20260915","state":{"status":"stopped_with_code","lastChange":1789479639884,"exitCode":0}}
```
