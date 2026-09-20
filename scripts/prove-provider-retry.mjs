// Run inside a disposable DEOS image with the changed supervisor modules copied
// into /deos/bin. This injects a provider failure; it is not live provider proof.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
for (const path of ['/deos/run', '/deos/output', '/tmp/retry-bin', '/tmp/retry-repo']) await mkdir(path, {recursive:true});
execFileSync('git', ['init', '-q'], {cwd:'/tmp/retry-repo'});
execFileSync('git', ['-c','user.name=Proof','-c','user.email=proof@example.invalid','commit','--allow-empty','-qm','base'], {cwd:'/tmp/retry-repo'});
await writeFile('/tmp/retry-bin/codex', `#!/usr/bin/env node
const fs=require('node:fs'), assert=require('node:assert/strict');
const log='/deos/output/invocations.jsonl';
const args=process.argv.slice(2);
fs.appendFileSync(log,JSON.stringify(args)+'\\n');
console.log(JSON.stringify({type:'thread.started',thread_id:'proof-session'}));
console.log(JSON.stringify({type:'turn.started'}));
if(!fs.existsSync('/tmp/retry-repo/saved-work.txt')) {
 fs.writeFileSync('/tmp/retry-repo/saved-work.txt','completed before outage');
 console.log(JSON.stringify({type:'turn.failed',error:{message:'Selected model is at capacity. Please try a different model.'}}));
 process.exitCode=1;
} else {
 assert.deepEqual(args.slice(0,4),['exec','resume','proof-session','-']);
 assert.equal(fs.readFileSync('/tmp/retry-repo/saved-work.txt','utf8'),'completed before outage');
 fs.writeFileSync('/deos/output/result.json',JSON.stringify({outcome:'completed'}));
 console.log(JSON.stringify({type:'turn.completed'}));
}
`, {mode:0o700});
const server=createServer((req,res)=>{req.resume();res.end('{}');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const deadline=new Date(Date.now()+90_000).toISOString();
await writeFile('/deos/run/prompt.txt','Continue the approved work.');
await writeFile('/deos/run/schema.json','{}');
await writeFile('/deos/run/job.json',JSON.stringify({attemptId:'retry-proof',runId:'retry-proof',nodeId:'proof',cwd:'/tmp/retry-repo',
 promptPath:'/deos/run/prompt.txt',resultSchemaPath:'/deos/run/schema.json',deadline,agentRole:'author',model:'unchanged-model',
 capabilityUrl:`http://127.0.0.1:${server.address().port}`,capabilityToken:'disposable-local-fixture'}));
try {
 const child=spawn('node',['/deos/bin/supervisor.mjs'],{env:{...process.env,PATH:`/tmp/retry-bin:${process.env.PATH}`},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stdout.resume();child.stderr.on('data',chunk=>{stderr+=chunk;});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 assert.equal(code,0,stderr);
 const invocations=(await readFile('/deos/output/invocations.jsonl','utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(invocations.length,2);
 assert.equal(invocations[0][invocations[0].indexOf('--model')+1],'unchanged-model');
 assert.equal(invocations[1][invocations[1].indexOf('--model')+1],'unchanged-model');
 const status=JSON.parse(await readFile('/deos/output/status.json','utf8'));
 assert.equal(status.exitCode,0);
 const transcript=await readFile('/deos/output/transcript.jsonl','utf8');
 assert.match(transcript,/turn.failed/);assert.match(transcript,/turn.completed/);
 assert.match(await readFile('/deos/output/original-errors.jsonl','utf8'),/Selected model is at capacity/);
 const receipt=JSON.parse((await readFile('/deos/output/provider-retries.jsonl','utf8')).trim());
 assert.equal(receipt.sessionId,'proof-session');assert.equal(receipt.retry,1);
 assert.ok(receipt.delayMs>=15_000&&receipt.delayMs<=18_000);
 assert.match(await readFile('/deos/output/patch.diff','utf8'),/completed before outage/);
 console.log(JSON.stringify({proof:'local injected provider failure',passed:true,invocations:invocations.length,
  sameSession:true,sameModel:true,workspacePreserved:true,originalErrorPreserved:true,delayMs:receipt.delayMs}));
} finally {server.close();}
