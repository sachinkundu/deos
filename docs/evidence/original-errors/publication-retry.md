# Retry a failed publication

SAC-160 had no Retry button because its agent completed and publication failed. The existing control only supported failed agent attempts.

The portal now offers Retry for failed planning and design publication visits. The backend validates the exact failed transition against the run's saved workflow definition. It creates a new visit for publication using the existing accepted candidate. Completed agent attempts and historical failure records stay intact. Repeated requests share the same replacement workflow identity.

The deployment does not retry SAC-160. The operator remains responsible for clicking Retry.

Validation: 306 Worker tests and 61 portal tests pass. The new database-backed checks cover same-definition continuation, duplicate requests, invalid/stale failures, authorization, dispatch, and portal eligibility without a failed agent attempt.

Live verification: Worker `ac5533d7-eda6-4e71-aabd-9911607743be` and portal `4e8e998b-8d94-4a69-b450-ae48d352e90b` each serve 100% traffic. Migration 0029 is applied. Codex Browser verified the visible **Retry publish planning revision** button on the SAC-160 page. D1 still shows the original failed visit 15 and timestamp `2026-09-07T13:30:18.732Z`; the button was not clicked.
