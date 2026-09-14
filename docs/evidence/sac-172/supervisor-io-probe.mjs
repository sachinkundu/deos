import assert from 'node:assert/strict';
import { atomicJson, captureSupervisorStreams } from '/deos/bin/supervisor-io.mjs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
const root = await mkdtemp('/tmp/supervisor-image-proof-');
try {
  const values = Array.from({length: 500}, (_,sequence) => ({sequence, content:String(sequence).repeat(1024)}));
  await Promise.all(values.map(value => atomicJson(root + '/heartbeat.json', value)));
  const saved = JSON.parse(await readFile(root + '/heartbeat.json','utf8'));
  assert.deepEqual(saved, values[saved.sequence]);
  assert.deepEqual(await readdir(root), ['heartbeat.json']);
  const captures = await captureSupervisorStreams(root);
  for (const [name, capture] of Object.entries(captures)) {
    capture.stream.end('partial ' + name + '\n');
    await finished(capture.stream);
  }
  const names = await readdir(root);
  assert.equal(names.filter(name => name.startsWith('deos-transcript.jsonl-')).length,1);
  assert.equal(names.filter(name => name.startsWith('deos-stderr.txt-')).length,1);
  await captures.transcript.finalize(root + '/transcript.jsonl');
  await captures.validation.finalize(root + '/validation.txt');
  assert.equal(await readFile(root + '/transcript.jsonl','utf8'),'partial transcript\n');
  assert.equal(await readFile(root + '/validation.txt','utf8'),'partial validation\n');
  console.log(JSON.stringify({platform:process.platform,architecture:process.arch,overlappingWrites:500,captureNames:'actual packaged supervisor',result:'passed'}));
} finally { await rm(root,{recursive:true,force:true}); }
