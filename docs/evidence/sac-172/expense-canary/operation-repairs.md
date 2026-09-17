# Expense canary follow-up repairs

Source commit: e4fa554. Application implementation was not edited by the operator.

## Verification

- Full repository suite: 601 tests, 600 passed, 1 skipped, 0 failed.
- Type checking and git diff whitespace check passed.
- Real local HTTP disconnect and duplicate-request tests preserve one execution and saved screenshot results.
- Real child-process tests preserve failure exit status, block dependent commands and retain cancellation output.
- Restart tests retain completed receipts and classify unfinished work as interrupted without replay.
- Built linux/amd64 container successfully loaded the CLI and exposed operation retrieval in help.
- No new provider-originated application run was started; that validation belongs to the next canary.

## Proposed next canary

Desktop reading queue: title, author and status (To read, Reading, Finished); add, edit and delete; filter by status with counts; browser-local persistence after refresh. No authentication, external integration or mobile scope.

The agent should show command completion before dependent tests, observe status while a demo runs, retrieve the same completed result and image paths without recapture, and reconcile a repeated request ID without repeating work. Claude still chooses demonstrations; these observations do not introduce new judgment gates.

A new Linear issue and run have not been created.

Final inspection also fixed hosted-only screenshot access: writing a public proof image permits directory traversal without listing, just as local previews already do. Private runtime files and operation receipts retain their file/directory restrictions.
