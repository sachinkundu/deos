import { mkdir, writeFile, readdir, rm, chmod } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const repository = '/tmp/preview-cwd-fixture/repository';
const runtime = '/tmp/preview-cwd-fixture/runtime';
await mkdir(`${repository}/dist`, {recursive:true});
await writeFile(`${repository}/dist/index.html`, '<title>Scratch isolation fixture</title>fixture response');
await mkdir(`${runtime}/.wrangler`, {recursive:true});
await mkdir('/tmp/preview-cwd-fixture/data', {recursive:true});
await chmod(runtime, 0o711);
execFileSync('chown', ['-R', 'deos-author:deos-author', repository, `${runtime}/.wrangler`, '/tmp/preview-cwd-fixture/data']);
const config = `${runtime}/local-worker.json`;
await writeFile(config, JSON.stringify({name:'preview-cwd-fixture',compatibility_date:'2026-08-27',assets:{directory:`${repository}/dist`}}));
const results = [];
for (const [label, cwd] of [['before', repository], ['after', runtime]]) {
  const child = spawn('runuser', ['-u','deos-author','--','env','-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/home/deos-author','wrangler','dev','--local','--config',config,'--ip','127.0.0.1','--port','8787','--persist-to','/tmp/preview-cwd-fixture/data'], {cwd,detached:true,stdio:['ignore','pipe','pipe']});
  const closed = new Promise(r=>child.once('close',r));
  let log = ''; child.stdout.on('data', d=>{log+=d}); child.stderr.on('data',d=>{log+=d});
  try {
    let body;
    for(let i=0;i<100;i++) {
      if(child.exitCode!==null) throw new Error(`Wrangler exited ${child.exitCode}: ${log}`);
      try {
        const response=await fetch('http://127.0.0.1:8787/', {signal:AbortSignal.timeout(1000)});
        body=await response.text();
        assert.equal(response.status,200);
        break;
      } catch(error) {
        if(i===99) throw new Error(`Preview did not serve: ${log}`,{cause:error});
        await new Promise(r=>setTimeout(r,300));
      }
    }
    assert.match(body,/fixture response/);
    const files = await readdir(repository);
    results.push({label,cwd,httpStatus:200,repositoryFiles:files,hasScratch:files.includes('.wrangler')});
  } finally {
    if(child.exitCode===null && child.signalCode===null) process.kill(-child.pid,'SIGTERM');
    await closed;
  }
  await rm(`${repository}/.wrangler`, {recursive:true,force:true});
}
assert.equal(results[0].hasScratch,true);
assert.equal(results[1].hasScratch,false);
console.log(JSON.stringify({wrangler:execFileSync('wrangler',['--version'],{encoding:'utf8'}).trim(),results},null,2));
