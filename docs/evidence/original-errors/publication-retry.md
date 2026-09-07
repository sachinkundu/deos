# Retry a failed publication

SAC-160 had no Retry button because its agent completed and publication failed. The existing control only supported failed agent attempts.

The portal now offers Retry for failed planning and design publication visits. The backend validates the exact failed transition against the run's saved workflow definition. It creates a new visit for publication using the existing accepted candidate. Completed agent attempts and historical failure records stay intact. Repeated requests share the same replacement workflow identity.

The deployment does not retry SAC-160. The operator remains responsible for clicking Retry.

Validation: 306 Worker tests and 61 portal tests pass. The new database-backed checks cover same-definition continuation, duplicate requests, invalid/stale failures, authorization, dispatch, and portal eligibility without a failed agent attempt.
