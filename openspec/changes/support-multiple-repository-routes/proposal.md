## Why

DEOS can receive events from many Linear projects. Its live settings still
manage one project and one repo. A second project cannot yet start work in its
own repo.

## What Changes

- Make project settings a list of repo routes. Each route links one Linear project to one GitHub repo.
- Fetch all repos that the current DEOS GitHub App can use. Let the user pair any of them with a Linear project.
- Use the current Settings page to add, view, change, enable, and disable routes.
- Show if the App can still use each repo. Link to GitHub when access needs a fix.
- Store workflow controls and the review model for each route.
- Let ingress and dispatch read enabled routes from D1. A new route needs no deploy.
- Copy the route, repo, App install, and settings into each new run. Later route edits must not change active work.
- Allow route edits during active work. The active run keeps its frozen values, while later runs use the edit.
- Prove two sample routes with the same real task: "create a simple text graphics generator which can create popular graphics on command line terminal".
- Use the current sample project and repo for the first route. Create a second sample project and repo for the other route.
- After both sample routes pass, configure the DEOS project and `sachinkundu/deos` as a third route. Do not run it yet.
- Keep one repo per Linear project in this slice. A repo choice inside one project is not included.
- Keep the current GitHub App. Do not add personal tokens or show secrets in the portal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-repository-settings`: Manage many repo routes, their App access, and their controls.
- `linear-event-ingress`: Admit work from enabled D1 routes instead of one deploy-time list.
- `workflow-dispatch`: Pick and freeze the right route for each event.
- `provider-capability-access`: Use the App install and repo saved on the run.

## Impact

- D1 project policy rows become the route list.
- The Settings page fetches App-accessible repos and changes from one form to a route list and editor.
- The portal gets safe provider lists through an internal Worker binding. Secrets stay in the queue Worker.
- Ingress, setup, dispatch, job input, and GitHub calls use the same route id.
- Deploy values can seed the first route. They do not limit later routes.
