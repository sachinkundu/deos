import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRecheck } from '/deos/bin/bounded-review.mjs';
const original = JSON.parse(await readFile('/proof/sac172-recheck.json', 'utf8'));
const result = validateRecheck(original, Object.keys(original.ratings).map(id => ({id})));
assert.deepEqual(result.ratings, original.ratings);
assert.equal(result.sources[0].provenance, 'local');
assert.deepEqual(result.declaredSourceEvidence.sources, original.sources);
console.log(JSON.stringify({proof:'Replay of SAC-172 saved native recheck', ratings:result.ratings, source:result.sources[0], warnings:result.sourceWarnings},null,2));

const blocked = JSON.parse(await readFile('/proof/sac172-blocked-recheck.json', 'utf8'));
assert.throws(() => validateRecheck(blocked, []), error => {
  assert.match(error.message, /REQUEST_FILE_UNAVAILABLE/);
  assert.match(error.message, /filesystem-reading process/);
  assert.deepEqual(error.cause, blocked);
  console.log(JSON.stringify({proof:'Actual blocked response retains original reviewer error', message:error.message, originalResponseRetained:true},null,2));
  return true;
});
