## Purpose

Let each person choose how confirmed workflow changes appear in the portal and keep that choice in the same browser.

## ADDED Requirements

### Requirement: Settings control live updates

The portal SHALL show a Live updates control in Settings. A person SHALL be able to turn it on or off. The control SHALL show the current choice.

#### Scenario: Person turns live updates on

- **WHEN** a person turns Live updates on in Settings.
- **THEN** the portal shows the control as on.

#### Scenario: Person turns live updates off

- **WHEN** a person turns Live updates off in Settings.
- **THEN** the portal shows the control as off.

### Requirement: The browser remembers the choice

The portal SHALL save the Live updates choice only in the current browser. It SHALL use the saved choice after a page reload and when the portal is opened again. It MUST NOT write the choice to D1 or any other server store. It MUST NOT sync the choice outside that browser.

#### Scenario: Person changes the choice

- **WHEN** a person changes the Live updates choice.
- **THEN** the portal saves it only in that browser and does not write it to D1 or another server store.

#### Scenario: Person reloads the portal

- **WHEN** a person reloads the portal after changing the Live updates choice.
- **THEN** the portal keeps the saved choice and uses its update mode.

#### Scenario: Person opens the portal again

- **WHEN** a person opens the portal again in a browser that has a saved choice.
- **THEN** the portal restores that choice before it handles a new workflow change.

#### Scenario: Person uses another browser

- **WHEN** a person opens the portal in another browser.
- **THEN** the portal does not copy or sync the saved choice to that browser.

### Requirement: Live mode applies confirmed changes at once

When Live updates are on, the portal SHALL apply each newer confirmed projection for the viewed run without a person taking action. It SHALL update the status, graph, history, and stage counts together. It SHALL NOT show **Apply update** for a change that it has applied on its own.

#### Scenario: New confirmed data arrives in live mode

- **WHEN** Live updates are on and a poll returns a newer confirmed projection for the viewed run.
- **THEN** the portal shows all data from that projection at once without asking the person to apply it.

#### Scenario: Poll returns the same confirmed data

- **WHEN** Live updates are on and a poll returns the same confirmed projection.
- **THEN** the portal keeps the current view and does not show an update action.

### Requirement: Manual mode keeps the apply action

When Live updates are off, the portal SHALL keep a newer confirmed projection pending. It SHALL tell the person that an update is ready and SHALL show **Apply update**. The current view SHALL stay in place until that action is used. If more confirmed changes arrive first, the action SHALL apply the latest confirmed projection.

#### Scenario: New confirmed data arrives in manual mode

- **WHEN** Live updates are off and a poll returns a newer confirmed projection for the viewed run.
- **THEN** the portal keeps the current view and shows that an update is ready with **Apply update**.

#### Scenario: Person applies the update

- **WHEN** a person uses **Apply update** while a confirmed projection is pending.
- **THEN** the portal updates the status, graph, history, and stage counts together from the latest confirmed projection.

#### Scenario: Person turns on live updates while data is pending

- **WHEN** a confirmed projection is pending and the person turns Live updates on.
- **THEN** the portal applies that projection at once and removes the manual update action.

### Requirement: Update modes keep the current read rules

The live and manual modes SHALL use the portal's current poll timing and rules for confirmed data. Live mode SHALL apply data only after those rules mark it as confirmed. Both modes MUST NOT write to issue state, workflow state, or data in the workflow service.

#### Scenario: Portal checks for an update

- **WHEN** either mode checks for or shows a workflow update.
- **THEN** the portal keeps the current poll and confirmation rules, live mode applies only confirmed data, and neither mode changes issue state, workflow state, or workflow service data.
