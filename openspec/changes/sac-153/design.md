## Context

See `proposal.md` for motivation and `specs/portal-live-updates/spec.md` for observable behavior. The workflow portal already polls for run projections, decides when a projection is confirmed, and offers a manual **Apply update** path. This change adds a browser-owned mode choice around that existing path. It must not change polling, confirmation, APIs, D1, workflow state, or issue state.

The preference must be available before the first poll result is handled. A projection must remain one coherent snapshot so status, graph, history, and stage counts cannot come from different poll results.

## Goals / Non-Goals

**Goals:**

- Give Settings and the run view one browser-local source of truth for the Live updates choice.
- Route each newer confirmed projection to either immediate display or the existing pending-update action.
- Make mode changes deterministic when a poll or pending projection exists.
- Preserve the current manual experience for browsers that have no saved choice.

**Non-Goals:**

- Introduce a server-side preference, API, D1 row, or cross-browser account setting.
- Replace or tune the current poll scheduler, projection confirmation rules, or projection ordering rules.
- Change the shape or production of workflow projections.
- Add a push transport such as WebSockets or server-sent events.

## Component Diagram

```mermaid
flowchart LR
    subgraph Browser[Portal in one browser]
        S[Settings Live updates control]
        P[Live update preference store]
        B[(Browser local storage)]
        C[Run update coordinator]
        V[Displayed run snapshot]
        M[Pending update notice and Apply update]

        S <--> P
        P <--> B
        P --> C
        C --> V
        C --> M
        M --> C
    end

    T[Existing poll timer] --> A[Existing portal read API]
    A --> F[Existing confirmation and newness rules]
    F -->|newer confirmed projection| C
```

The preference store is client-only. It owns parsing, persistence, in-page subscriptions, and same-browser document synchronization. The run update coordinator is the single place that combines the current mode with confirmed poll results. Existing read and confirmation components remain authoritative for whether a projection may enter the coordinator.

## Event Flow

1. During portal startup, the preference store reads the saved value synchronously before the run view enables poll-result handling. A valid saved value becomes the current mode; a missing or invalid value defaults to manual mode.
2. Settings reads and writes the same preference store. A successful toggle updates the in-memory value, saves it in browser storage, and updates subscribers in the current document. Other open portal documents receive the browser storage event only as an invalidation signal: each receiver rereads the key, validates the current stored value, and then publishes that value. A receiver never applies the event payload directly, so a delayed event for an older write cannot replace a newer persisted choice.
3. The existing poll timer and read API continue unchanged. The existing confirmation and newness rules discard unconfirmed, older, or equivalent projections before they reach the coordinator.
4. When a newer confirmed projection arrives in live mode, the coordinator replaces the displayed snapshot with that complete projection and clears any pending projection. The manual notice is absent.
5. When a newer confirmed projection arrives in manual mode, the coordinator leaves the displayed snapshot unchanged and stores the new projection as pending. A later newer confirmed result replaces the pending value, so **Apply update** always promotes the latest confirmed projection.
6. **Apply update** atomically promotes the pending projection to the displayed snapshot and clears the pending value. All run-derived sections render from that one displayed snapshot.
7. Turning Live updates on atomically promotes any pending projection and clears the manual notice. Turning it off leaves the displayed snapshot in place; the next newer confirmed projection becomes pending.
8. If a poll resolves concurrently with a mode change, the coordinator uses the current in-memory mode when it handles the confirmed result. If the viewed run changes, displayed and pending projection state are reinitialized for the new run so data cannot cross run boundaries.

## Minimal Data Model

No server data model changes are required.

The browser stores one versioned JSON value under a portal-owned key:

```text
LiveUpdatePreference {
  version: 1,
  enabled: boolean
}
```

Versioning permits invalid or future shapes to fail closed to manual mode. The key is not sent to the portal API and is not copied into D1, workflow records, telemetry payloads, or provider data.

The run view keeps only transient state:

```text
RunUpdateState {
  runIdentity,
  preferenceReady,
  displayedProjection,
  pendingProjection | null
}
```

`displayedProjection` and `pendingProjection` are complete projection snapshots in the portal's existing shape. Existing projection identity and ordering logic determines whether an incoming confirmed projection is newer; this feature does not create a second revision algorithm.

## Decisions

### Default to manual mode

A missing, malformed, unsupported, or unreadable saved value resolves to `enabled: false`. This preserves the current behavior for existing browsers and makes storage failures fail closed. Defaulting to live mode was rejected because it would silently change how existing users consume updates.

### Use one versioned browser-local preference store

Settings and run views use one small client abstraction over browser local storage. It exposes the loaded value, a setter, and change subscription rather than letting components read the storage key independently. This prevents inconsistent parsing and lets an already-open run view react to a Settings change. Component-specific storage access was rejected because it can produce stale modes and duplicate fallback rules. Server persistence was rejected by the specification.

### Reuse the existing confirmed-projection pipeline

Mode selection happens only after the current code has established that a projection is confirmed and newer. The coordinator does not poll, fetch, confirm, or reorder data itself. A parallel live-update fetch path was rejected because it could drift from the current timing and confirmation rules.

### Reduce updates as complete projection snapshots

The coordinator changes `displayedProjection` and `pendingProjection` in one state transition. Status, graph, history, and stage counts derive from `displayedProjection`; no section applies an incoming projection independently. Per-widget updates were rejected because a render could combine different confirmed revisions.

### Keep only the latest pending projection

Manual mode stores one pending snapshot and replaces it when a newer confirmed snapshot arrives. It does not queue every intermediate projection. This matches **Apply update** semantics and bounds browser memory. An ordered client queue was rejected because the user asks to reach the latest confirmed view, not replay intermediate renders.

### Synchronize within the browser without creating account sync

The preference store publishes same-document changes and listens for the browser storage event from other portal documents. The stored key is authoritative: every event causes a fresh read and validation, and the event payload is not applied directly. Therefore the last value actually present in browser storage wins without adding timestamps or counters to the preference. This keeps open tabs in one browser aligned while preserving the browser-only boundary. A remote synchronization channel was rejected because it would require server state and cross-browser identity.

## Failure Modes

- **Browser storage is unavailable or throws while loading**: retain the original exception as a contextual client diagnostic, initialize manual mode, and continue rendering the portal. Do not call a server fallback.
- **A preference write fails**: keep the selected mode for the current document, report that the choice could not be saved, and retain the original exception in client diagnostics. A reload may return to manual mode; the UI must not claim that persistence succeeded.
- **Stored JSON is malformed or has an unsupported version**: record the parse or validation cause in client diagnostics, ignore the value, and use manual mode. The next successful toggle replaces it with the current schema.
- **A poll returns unconfirmed, older, or equivalent data**: the existing confirmation/newness path rejects it before mode routing; displayed and pending state do not change.
- **A poll request fails**: preserve the current displayed and pending snapshots and let the existing polling error and retry behavior handle the original failure. Live mode must not convert a read failure into an empty render.
- **A mode toggle races with a poll completion**: serialize both through the coordinator and evaluate the result against the latest in-memory preference. This avoids leaving a pending action visible after live mode has applied that projection.
- **The viewed run changes with an old poll in flight**: compare the result's run identity with the coordinator's current run and discard mismatches. Reset pending state on navigation.
- **Another tab changes the preference**: treat the storage event as invalidation, reread and validate the authoritative key, and apply that current value. Ignore the event payload itself. Immediately promote a pending projection if the reread value enables live mode.
- **A render component fails after snapshot promotion**: preserve the original component error and projection context in diagnostics. Do not partially mutate other projection fields or fall back to an older snapshot silently.

## Risks / Trade-offs

- **[Browser storage can be cleared or disabled]** → Default safely to manual mode and make failed persistence visible without adding server storage.
- **[Last-write-wins behavior can surprise people using several tabs]** → Reread the authoritative key for every storage event so delayed events cannot regress a document to an older event payload and all open documents converge on the latest persisted choice.
- **[Automatic promotion can expose latent assumptions that updates are user-triggered]** → Put both automatic and manual promotion through the same atomic snapshot transition and test both entry paths against every run-derived section.
- **[Keeping a complete pending snapshot duplicates client memory]** → Retain only one latest pending snapshot and release it after promotion, navigation, or replacement.

## Migration Plan

1. Add the preference store and Settings control with manual mode as the fallback for browsers without a valid saved value.
2. Route confirmed projections through the coordinator while preserving the existing poll, confirmation, and manual apply behavior.
3. Verify reload, reopen, same-browser tab, pending replacement, toggle-race, navigation, and storage-failure cases in portal tests. Verify status, graph, history, and stage counts always use one displayed projection.
4. Build from the DEOS root with `npm run portal:build`, then deploy with `npx wrangler deploy --config portal/wrangler.jsonc`. No server migration or API rollout is required, and existing browsers begin in manual mode until a person opts in.
5. Read back the deployed portal version and confirm that it serves 100% of traffic before treating the release as active. An upload or local build alone is not activation evidence.
6. Verify the live portal in an Access-authenticated browser. Capture sanitized screenshots of the saved Settings choice and a viewed run in both paths: automatic promotion in live mode and the pending **Apply update** action in manual mode. Attach the visual proof with the deployed-version readback to the implementation pull request.

Rollback removes the control and coordinator routing and restores the existing manual path. The unused browser key is harmless and should remain untouched during rollback so a later redeploy can restore the person's choice. No D1 or workflow rollback is needed.
