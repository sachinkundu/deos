import assert from 'node:assert/strict';
import test from 'node:test';
import {insertTestMarker,markerIsStandalone,removeTestMarker,testIssueMarker,
  testMarkerHashes} from '../src/shared-test-marker.ts';

const subject={expectationId:'expectation-1',runId:'run-1',leaseId:'lease-1',
  taskId:'issue-1',fence:3};

test('versioned keyed mark is fixed to the expectation, issue and fence',async()=>{
  const marker=await testIssueMarker(subject,'local-test-key');
  assert.match(marker,/^<!-- deos-test-v1:expectation-1:[a-f0-9]{64} -->$/);
  assert.notEqual(marker,await testIssueMarker({...subject,fence:4},'local-test-key'));
  assert.notEqual(marker,await testIssueMarker(subject,'another-local-test-key'));
  const before='Task description\n';
  const after=insertTestMarker(before,marker);
  assert.equal(insertTestMarker(after,marker),after);
  assert.equal(markerIsStandalone(after,marker),true);
  assert.equal(removeTestMarker(after,marker),before);
  const humanEdited=after.replace('Task description','Task description\nHuman edit');
  assert.equal(removeTestMarker(humanEdited,marker),'Task description\nHuman edit\n');
  assert.notDeepEqual(await testMarkerHashes(before,after,marker),
    await testMarkerHashes(before,humanEdited,marker));
});

test('foreign and ambiguous marks stop instead of widening an issue patch',async()=>{
  const marker=await testIssueMarker(subject,'local-test-key');
  assert.throws(()=>insertTestMarker(`Other\n<!-- deos-test-v1:foreign:abc -->`,marker),
    /foreign_test_marker/);
  assert.throws(()=>removeTestMarker(`${marker}\n${marker}`,marker),/ambiguous/);
  assert.throws(()=>removeTestMarker(`prefix ${marker}`,marker),/missing_or_ambiguous/);
});
