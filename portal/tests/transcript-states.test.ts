import test from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptReadStore, TranscriptNotFoundError } from '../src/transcript.ts';
const attemptId='01a03852-9204-7612-bbb6-b76579f1462a';
const bytes=new TextEncoder().encode('');
const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
const metadata={attempt_id:attemptId,run_id:'run',node_id:'independent_discovery',run_sequence:1,issue_key:'TEST',r2_key:'private/key',media_type:'application/jsonl',byte_size:0,sha256};
const database=(rows: unknown[])=>({prepare(){return {bind(){return {async first(){return rows.shift()??null;}}}}}} as unknown as D1Database);
test('verified zero-byte transcript returns an explicit empty state',async()=>{
 const bucket={get:async()=>({size:0,arrayBuffer:async()=>bytes.buffer})} as unknown as R2Bucket;
 const result=await new TranscriptReadStore(database([metadata]),bucket).view(attemptId);
 assert.equal(result.state,'empty');assert.equal(result.eventCount,0);
 assert.equal(result.message,'No transcript content was captured.');
});
test('missing bytes are corrupt even when a manifest declares zero events',async()=>{
 const bucket={get:async()=>null} as unknown as R2Bucket;
 const result=await new TranscriptReadStore(database([metadata]),bucket).view(attemptId);
 assert.equal(result.state,'corrupt');
});
test('legacy missing locator is unavailable and required new locator is corrupt',async()=>{
 for(const required of [false,true]){
  const result=await new TranscriptReadStore(database([null,{attempt_id:attemptId,job_spec_json:JSON.stringify(required?{transcriptSchema:'deos-transcript-v1'}:{})}]),{} as R2Bucket).view(attemptId);
  assert.equal(result.state,required?'corrupt':'unavailable');
 }
});
test('unknown or unauthorized attempts retain the not-found boundary',async()=>{
 await assert.rejects(()=>new TranscriptReadStore(database([null,null]),{} as R2Bucket).view(attemptId),TranscriptNotFoundError);
});
test('a known child with missing capture is corrupt, not an empty transcript',async()=>{
 const result=await new TranscriptReadStore(database([null,{attempt_id:attemptId}]),{} as R2Bucket).child('child');
 assert.equal(result.state,'corrupt');
 await assert.rejects(()=>new TranscriptReadStore(database([null,null]),{} as R2Bucket).child('unknown'),TranscriptNotFoundError);
});
test('invalid child JSON is reported as corrupt with its parser error',async()=>{
 const text='{broken';
 const artifact_sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const result=await new TranscriptReadStore(database([{attempt_id:attemptId,r2_key:'journal',artifact_sha256}]),{get:async()=>({text:async()=>text})} as unknown as R2Bucket).child('child');
 assert.equal(result.state,'corrupt');assert.equal(typeof result.detail,'string');
});
