# PR proof presentation

The original image URLs required a DEOS session and returned HTTP 401 to an
anonymous request. GitHub could not display them.

The publisher now copies the saved browser images and Showboat records to a
separate proof branch in the same repository. The PR uses commit-pinned GitHub
image URLs. The proof commit has no parent, so this does not change the code
branch or add files to the implementation diff.

[SAC-225 PR33](https://github.com/sachinkundu/deos-sample-project/pull/33) now uses
the requested template: title, implementation/release statement, Linear,
approved planning PR31, approved design PR32, numbered behavior images with
their saved captions, and one Showboat link. Test reports and agent discussion
remain in transcripts. This change copies the existing artifacts; it does not
recreate or judge the calculator demos.

The authenticated GitHub browser loaded all 31 image elements with nonzero
natural dimensions. [Browser readback](pr-proof-browser.json) and
[screenshot](pr-proof-github.png) record the result. The
[Showboat readback](pr-proof-showboat.md) records the real GitHub and D1 state.

The implementation head remains `72c46f9f2a3027600289cb60911e2857a08ee688`.
PR33 is open and unmerged. The run still waits at implementation review,
visit 55, on its frozen version 36. No agent was restarted.

Backend `cae85996-58b2-450d-8bdd-9926da6087f3` is active at 100 percent.
The container image and portal deployment did not change. Future sample-project
runs select version 37 with the new instructions, dispatch enabled, and the
same human reviewer. Its definition was registered before the Settings save;
an initial save before registration failed without changing the route.

Local validation passed: the full backend suite, TypeScript, generated Worker
bindings, strict OpenSpec validation, and the focused image publication check
after the final list-indentation change. These are development checks on the
publisher, separate from the browser and provider readback above.
