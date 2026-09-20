// Offline replay of the real SAC-246 capture receipts. No application execution,
// provider access or agent invocation. The publisher uses a local output sink.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname, basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {beginBrowserDemo, finishBrowserDemo} from '../container/implementation-browser-demo.mjs';
import {selectReviewProof, selectedReviewProof} from '../container/implementation-runtime.mjs';
import {createEvidenceChecklist, updateEvidenceChecklist} from '../container/implementation-evidence-checklist.mjs';
import {publishImplementationProof} from '../src/implementation-pr-proof.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'docs/evidence/sandbox-local-browser');
const output = resolve(process.argv[2] ?? join(root, 'docs/evidence/evidence-checklist/demo-replay'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const initial = (await readJson(join(source, 'final-cloud-demo-receipt.json'))).result;
const responseEvents = await readJson(join(source, 'response-final-demo-receipt.json'));
const response = {collectionId:responseEvents.at(-1).collectionId, captures:responseEvents
  .filter(event => event.event === 'step_completed' && event.result?.proof)
  .map(event => ({...event.result, scenarioId:event.scenarioId, stepIndex:event.stepIndex}))};
const mainReadback = await readJson(join(source, 'cloud-captures/final-gallery-readback.json'));
const responseReadback = await readJson(join(source, 'cloud-captures/response-readback.json'));
const planSource = join(root, 'docs/evidence/sac-172/storage-canary/demo-plan-proof.json');
const planReceipt = await readJson(planSource);
const plan = {sha256:planReceipt.artifactSha256, value:planReceipt.result};
const completion = await readJson(join(source, 'completion.json'));
await mkdir(output, {recursive:true});

// Retain exact historical proof IDs, source identities, captions and image bytes.
const objects = new Map();
const imageInventory = [];
for (const entry of [...mainReadback, ...responseReadback]) {
  const path = join(source, 'cloud-captures', basename(entry.path));
  const bytes = await readFile(path);
  assert.equal(hash(bytes), entry.sha256, `Saved image changed: ${path}`);
  imageInventory.push({file:basename(path),sha256:entry.sha256});
  for (const capture of [...initial.captures, ...response.captures]) {
    if (capture.proof.sha256 === entry.sha256) objects.set(capture.proof.path, bytes);
  }
}
const readbackHashes = new Set(responseReadback.map(item => item.sha256));
// The response's setup and final survivor screenshot share the same bytes.
// Reproduce the three distinct images published in the original response.
const seen = new Set();
const corrective = response.captures.filter(capture => {
  if (!readbackHashes.has(capture.proof.sha256) || seen.has(capture.proof.sha256)) return false;
  seen.add(capture.proof.sha256); return true;
});
assert.equal(initial.captures.length,11);
assert.equal(corrective.length,3);

// Wrap archived raw receipts as an explicitly replay-created document. These are
// historical provider results, not commands or storage operations executed today.
const receiptNames = ['final-cloud-storage-proof.json','response-storage-proof.json','final-provider-readback.json'];
const raw = await Promise.all(receiptNames.map(async name => ({name,bytes:await readFile(join(source,name),'utf8')})));
const recordBytes = Buffer.from('# Archived SAC-246 receipts for offline replay\n\n' +
  'Original capture: 18 September 2026. No commands in these receipts were rerun.\n\n' +
  raw.map(({name,bytes})=>`## ${name}\n\nSource SHA-256: ${hash(bytes)}\n\n\`\`\`json\n${bytes}\n\`\`\``).join('\n\n'));
const record = {...initial.captures[0].proof,id:'offline-replay:archived-storage-and-cleanup',kind:'showboat',
  path:'offline-replay/archived-receipts.md',caption:'Archived D1/R2 and cleanup receipts; not newly executed',
  sha256:hash(recordBytes),audience:'review'};
objects.set(record.path,recordBytes);

const state = {proof:[],evidenceChecklist:createEvidenceChecklist(plan)};
beginBrowserDemo(state);
finishBrowserDemo(state,initial);
state.proof.push(record);
selectReviewProof(state,state.proof.map(proof=>proof.id));
const scenarioProof = id => initial.captures.filter(c=>c.scenarioId===id).map(c=>c.proof.id);
const bindings = new Map([
  [0,[...scenarioProof('remote-empty-shelf'),record.id]],
  [1,[...scenarioProof('remote-save-read-refresh-delete'),record.id]],
  [2,scenarioProof('remote-fresh-context-continuity')],
  [3,scenarioProof('remote-validation-errors')],
  [4,scenarioProof('remote-literal-markup')],
  [6,[...scenarioProof('remote-capacity-failure'),record.id]],
]);
const stamp = {attemptId:'offline-replay-author',treeSha:initial.captures[0].proof.treeSha,occurredAt:'2026-09-20T00:00:00Z'};
state.evidenceChecklist = updateEvidenceChecklist(state.evidenceChecklist,[...bindings].map(([index,evidenceIds])=>({
  id:plan.value.scenarios[index].id,state:'complete',evidenceIds,
  reason:'Replay fixture links the original images and recorded provider results. This is a bookkeeping check, not a new semantic approval. Later clarification moved cleanup to the workflow.'
})),state.proof,stamp);

// A local sink implements just the publisher's GitHub storage contract. It never
// sends HTTP. Assert both rejected candidates cause zero sink writes.
const blobs = new Map(), files = new Map();
let writes = 0, publishedCommit = null;
const gitHash = (kind,bytes) => createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
const sink = {
  repository:'local-replay/sac-246',
  async ref() { return publishedCommit; },
  async file(path) { return files.get(path)?.toString('utf8'); },
  async json(path, options) {
    if (path === '') return {private:false};
    assert.equal(options?.method,'POST'); writes++;
    const body = JSON.parse(options.body);
    if (path === '/git/blobs') {
      const bytes = Buffer.from(body.content,'base64'), sha = gitHash('blob',bytes);
      blobs.set(sha,bytes); return {sha};
    }
    if (path === '/git/trees') {
      for (const entry of body.tree) {
        const bytes = blobs.get(entry.sha); assert.ok(bytes);
        files.set(entry.path,bytes);
        const file = join(output,entry.path);
        await mkdir(dirname(file),{recursive:true}); await writeFile(file,bytes);
      }
      return {sha:gitHash('tree',Buffer.from(JSON.stringify(body.tree)))};
    }
    if (path === '/git/commits') return {sha:gitHash('commit',Buffer.from(JSON.stringify(body)))};
    if (path === '/git/refs') { publishedCommit=body.sha; return {ref:body.ref,object:{sha:body.sha}}; }
    throw new Error(`Unexpected publisher operation ${path}`);
  },
};
const store = {async readBytes(path,sha) {
  const bytes=objects.get(path); assert.ok(bytes,`Missing saved bytes for ${path}`);
  assert.equal(hash(bytes),sha,`Artifact hash differs for ${path}`); return bytes;
}};
const work = {run_id:'offline-replay-of-sac-246',linear_identifier:'SAC-246',issue_run_sequence:1,created_at:'2026-09-20T00:00:00Z'};
const candidate = () => ({proof:selectedReviewProof(state),proofArchive:state.proof,evidenceChecklist:state.evidenceChecklist,proofOmissions:state.proofOmissions??[]});
const rejections = [];
const reject = async (label, input) => {
  const before = writes;
  await assert.rejects(publishImplementationProof(sink,store,work,input,plan), error => {
    rejections.push({label,error:error.message,writesDuringRejectedPublication:writes-before});
    return /Evidence checklist is not ready/.test(error.message);
  });
  assert.equal(writes,before);
};
await reject('Missing failed-read/delete evidence',candidate());

const beforeNewCollection = state.proof.map(proof=>proof.id);
beginBrowserDemo(state);
assert.deepEqual(state.proof.map(proof=>proof.id),beforeNewCollection,'Starting a correction must preserve the main flow');
finishBrowserDemo(state,response);
// Explicitly omit the duplicate final survivor capture, retaining its original.
const duplicate = response.captures.find(c=>!corrective.includes(c));
selectReviewProof(state,corrective.map(c=>c.proof.id),[{id:duplicate.proof.id,reason:'Duplicate bytes of the setup/survivor image; original stays archived.'}],{attemptId:'offline-replay-response',occurredAt:stamp.occurredAt});
state.evidenceChecklist = updateEvidenceChecklist(state.evidenceChecklist,[{
  id:plan.value.scenarios[5].id,state:'complete',evidenceIds:corrective.map(c=>c.proof.id),
  reason:'Original corrective collection shows failed read/delete handling with a labeled synthetic inconsistent-storage fixture. Replayed evidence only.'
}],state.proof,{...stamp,attemptId:'offline-replay-response',treeSha:corrective[0].proof.treeSha});
state.evidenceChecklist = createEvidenceChecklist(plan,JSON.parse(JSON.stringify(state.evidenceChecklist)));
const ready = candidate();
assert.equal(ready.proof.filter(p=>p.kind==='browser_image').length,14);
const lost = {...ready,proof:ready.proof.filter(p=>p.id!==scenarioProof('remote-empty-shelf')[0])};
await reject('One earlier referenced image lost from publication',lost);
const result = await publishImplementationProof(sink,store,work,ready,plan);
const firstWrites = writes;
assert.deepEqual(await publishImplementationProof(sink,store,work,ready,plan),result);
assert.equal(writes,firstWrites,'Repeat publication must reuse the same immutable output');
const manifest=JSON.parse(files.get('manifest.json').toString());
assert.equal(manifest.proof.filter(p=>p.kind==='browser_image').length,14);
assert.equal(new Set(manifest.proof.filter(p=>p.kind==='browser_image').map(p=>p.sha256)).size,14);
for (const proof of ready.proof.filter(p=>p.kind==='browser_image'))
  assert.equal(hash(files.get(`images/${proof.sha256}.png`)),proof.sha256);
const markdown=files.get('evidence-checklist.md').toString();
let checkedLinks=0;
for (const match of markdown.matchAll(/\[Evidence\]\(([^)]+)\)/g)) {
  const [path,anchor]=match[1].split('#'); assert.ok(files.has(path),`Unpublished checklist target ${path}`);
  if(anchor) assert.ok(files.get(path).toString().includes(`id="${anchor}"`));
  checkedLinks++;
}
const escape = value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const images=ready.proof.filter(p=>p.kind==='browser_image');
const gallery = `<!doctype html><meta charset="utf-8"><title>SAC-246 evidence replay</title>
<style>body{font:17px system-ui;max-width:1100px;margin:40px auto;padding:0 24px;background:#f6f7f9;color:#17212e}h1{font-size:32px}.notice,article{background:white;padding:22px;border-radius:12px;margin:18px 0}img{width:100%;height:auto;border:1px solid #ccd3dc}li{margin:10px 0}a{color:#175cc0}small{color:#465267}details{margin:18px 0}</style>
<h1>Existing demo: evidence replay</h1><div class="notice"><b>14 original screenshots retained · 7 checklist items accounted for</b><p>This is an offline replay of the 18 September SAC-246 demo through the changed workflow code. The application was not rebuilt or rerun. Checklist answers are replay fixtures. No Cloudflare agent or GitHub publication ran.</p><p>Both deliberately incomplete submissions were rejected before publication. The corrected output retained all 11 main-flow and 3 corrective images. Each image matches its saved SHA-256.</p><a href="evidence-checklist.md">Generated checklist</a> · <a href="showboat.md">Archived provider evidence</a> · <a href="report.json">Replay report</a></div>
<h2>Checklist</h2><ul>${ready.evidenceChecklist.items.map(item=>`<li>✓ ${escape(item.title)} <small>(${item.evidenceIds.length} evidence links)</small></li>`).join('')}</ul>
<h2>Retained evidence</h2>${images.map((proof,index)=>`<article><h3>${index+1}. ${escape(proof.caption.split('\n')[0])}</h3><img loading="lazy" src="images/${proof.sha256}.png" alt="${escape(proof.caption.split('\n')[0])}"><details><summary>Original capture details</summary><small>${escape(proof.caption)}<br>SHA-256: ${proof.sha256}</small></details></article>`).join('')}`;
await writeFile(join(output,'index.html'),gallery);
const report = {kind:'offline-real-artifact-replay',samplePr:completion.samplePr,sampleHead:completion.sampleHead,
  applicationRebuilt:false,applicationExecuted:false,cloudAgentInvoked:false,liveGitHubPublication:false,
  originalCaptureDate:'2026-09-18',planSourceSha256:hash(await readFile(planSource)),savedPlanArtifactSha256:plan.sha256,
  mainImagesRetained:11,correctiveImagesSelected:3,imagesPublishedLocally:14,allImageHashesVerified:true,
  checklistItems:ready.evidenceChecklist.items.length,checklistEvidenceLinksVerified:checkedLinks,
  checklistHistoryEntries:ready.evidenceChecklist.history.length,duplicateCaptureArchived:true,
  rejectedIncompletePublications:rejections,idempotentPublication:true,imageInventory,
  outputFiles:[...files.keys(),'index.html','report.json']};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',mainImages:11,correctiveImages:3,retainedImages:14,
  checklistItems:report.checklistItems,verifiedLinks:checkedLinks,negativeChecks:rejections.length,
  replayedWithoutAdditionalWrites:true,applicationRebuilt:false,cloudAgentInvoked:false,output},null,2));
