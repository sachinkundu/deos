# SAC-182 shared test recovery, 2026-09-29

The trusted Worker used its stored Access service credential against the
lease app's `/api/version` endpoint and received HTTP 200 with `admitted: true`.
The credential was therefore checked by a real deployed Worker call, not just
by a secret timestamp.

Run 2 retained candidate work in PR #137. Its first test lease failed during
setup, before activation or app/provider test work. The coordinator wrote and
read back a failed-setup note on PR #137, removed its four owned resources,
proved each absent, and saved the abort receipt. The site became free at
2026-09-29T06:08:58.475Z. That lease has no test attestation or success close.

The original Cloudflare Workflow instance
`wf-v1-et6zs3l4ndwgsj6qfcetsl5usjwra4wh2z3lwyltor6liv6hbioa` ended
Errored after 5,972 completed steps. Its last successful authority step was
visit 1494; the final system action failed six times. Cloudflare reports
`AggregateError: Original error storage failed; complete errors are in Workers
logs`. The detailed final exception was not written to `workflow_errors` and
was not returned by an Observability query for this instance. Earlier recorded
errors and the original failed-setup fault remain in D1 and R2. The final
exception's cause is unavailable; it must not be presented as diagnosed.

A guarded recovery established a new executor at visit 1495. It stopped before
any new request with `stored workflow definition digest mismatch`. D1 has that
original error under ID `597a5ddc-74a2-4808-b0cd-a6e0c460838a`. The run was
admitted under bundled implementation v44 digest `08ee27af...`, while D1's
older v44 row has digest `5a6cf0b2...`. The bundled v45 definition has the
same content as the admitted v44 bundle except its version field. The next
repair records this exact mismatch and moves only run 2 to registered v45;
the historical v44 definition is retained.

Migration `0068_sac_182_definition_repair.sql` recorded that exact repair in
`workflow_definition_repairs`. A second guarded recovery established instance
`wf-v1-3vl3fmtcwbhyj3i3nhgpazsxxk4osgtmrwujzwhitwvqgs2xmsfq` at visit
1496. It retained PR #137 and candidate commit
`3837087abb16000f115887afe714b4cc2f4acadd`, then requested a new lease:
`21c57acf3c8489cb1cc1438437ad16cc8a835c5a080b5b510a46414bd4ba6b5c`.
The coordinator pinned staging source `f8275c1e21a420febeed40139e16fd90605f7b80`
and created the isolated portal, BettaView, D1, and R2 resources.

The pinned staging app build predates the lease version field. The trusted
lease edge wrapper now reports the fixed base version from its own binding,
and an edge revision tag guards refresh of existing lease Workers. The
BettaView refresh preserves its existing Durable Object migration. Both
protected app origins returned HTTP 200 with the expected source, build, and
base version. D1 saved two service readbacks and moved the lease to `active`
at 2026-09-29T06:44:18.545Z. These facts prove setup and activation only;
candidate, app use, and provider proof remain separate checks.
