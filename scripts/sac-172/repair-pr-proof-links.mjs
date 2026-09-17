// Mechanical publication recovery: keep the implementation and selected images.
// Usage: node --experimental-strip-types scripts/sac-172/repair-pr-proof-links.mjs request.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { implementationProofImageUrl, implementationProofMarkdown, proofCaption } from '../../src/implementation-pr-proof.ts';

const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { repository, number, expectedHead, outputDirectory, apply = false } = request;
await mkdir(outputDirectory, { recursive: true });
const gh = (...args) => execFileSync('rtk', ['proxy', 'gh', ...args], { encoding: 'utf8' });
const api = path => JSON.parse(gh('api', `repos/${repository}${path}`));
assert.equal(api('').private, false, 'This recovery uses public image URLs only');
const before = api(`/pulls/${number}`);
assert.equal(before.state, 'open');
assert.equal(before.merged, false);
assert.equal(before.head.sha, expectedHead);
await writeFile(`${outputDirectory}/before.json`, JSON.stringify(before, null, 2) + '\n');
const match = before.body.match(/This is the \[Showboat file\]\(https:\/\/github.com\/[^/]+\/[^/]+\/blob\/([a-f0-9]{40})\/showboat.md\)/);
assert.ok(match, 'Expected the published Showboat link');
const commit = match[1];
const file = api(`/contents/manifest.json?ref=${commit}`);
const manifest = JSON.parse(Buffer.from(file.content, 'base64').toString());
const images = manifest.proof.filter(proof => proof.kind === 'browser_image');
assert.ok(images.length > 0);
const oldGallery = implementationProofMarkdown({ images: images.map(proof => ({
  caption: proof.caption, url: `../blob/${commit}/images/${proof.sha256}.png?raw=true`,
})) }).join('\n\n');
assert.ok(before.body.includes(oldGallery), 'The gallery changed; preserve human edits and inspect before recovery');
const newGallery = implementationProofMarkdown({ images: images.map(proof => ({
  caption: proofCaption(proof.caption),
  url: implementationProofImageUrl(repository, commit, proof.sha256, true),
})) }).join('\n\n');
const body = before.body.replace(oldGallery, newGallery);
await writeFile(`${outputDirectory}/body.md`, body);
await writeFile(`${outputDirectory}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
if (apply) {
  const latest = api(`/pulls/${number}`);
  assert.equal(latest.body, before.body, 'PR body changed during preparation');
  assert.equal(latest.head.sha, before.head.sha, 'PR code changed during preparation');
  assert.equal(latest.state, 'open');
  assert.equal(latest.merged, false);
  gh('pr', 'edit', String(number), '--repo', repository, '--body-file', `${outputDirectory}/body.md`);
  const after = api(`/pulls/${number}`);
  assert.equal(after.body, body);
  assert.equal(after.head.sha, before.head.sha);
  assert.equal(after.state, 'open');
  assert.equal(after.merged, false);
  await writeFile(`${outputDirectory}/after.json`, JSON.stringify(after, null, 2) + '\n');
}
console.log(JSON.stringify({ applied: apply, url: before.html_url, images: images.length, proofCommit: commit, codeHead: before.head.sha }));
