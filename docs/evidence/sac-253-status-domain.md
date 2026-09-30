# SAC-253 shared test domain reachability

*2026-09-27T05:32:37Z by Showboat 0.6.1*
<!-- showboat-id: b0c59fd1-adf6-4999-91de-a142e7d8ba69 -->

The owner reported attaching deos-test.voxdez.com to deos-shared-test-portal in the Cloudflare dashboard on 2026-09-27. This unauthenticated check establishes that DNS resolves and Cloudflare Access guards the hostname. It does not prove the domain-to-Worker mapping, authenticated Worker page, or a test lease.

```bash
curl -sS -I --max-time 15 https://deos-test.voxdez.com/ | tr -d '\r' | sed 's/[[:space:]]*$//' | awk 'BEGIN{IGNORECASE=1} /^HTTP\// || /^www-authenticate:/ || /^server:/'
```

```output
HTTP/2 401
www-authenticate: Bearer realm="OAuth", error="invalid_token", error_description="Missing or invalid access token", resource_metadata="https://deos-test.voxdez.com/.well-known/cloudflare-access-protected-resource/"
server: cloudflare
```

The custom domain is managed in the Cloudflare dashboard. The Wrangler configuration omits route and routes while keeping workers_dev false, following Cloudflare guidance for dashboard-managed routes: https://developers.cloudflare.com/workers/wrangler/configuration/. This keeps future Worker uploads from trying to modify the owner-controlled domain route.
