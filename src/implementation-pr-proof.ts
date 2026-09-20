import { ImplementationError, type ImplementationCandidate } from './implementation-contract.ts';
import type { ImplementationGitHub } from './implementation-github.ts';
import type { ImplementationRun, ImplementationStore } from './implementation-store.ts';
import { sha256Hex } from './implementation-hash.ts';
import { requireEvidenceChecklist, evidenceChecklistMarkdown, type ChecklistPlan } from '../container/implementation-evidence-checklist.mjs';

export interface PublishedImplementationProof {
  images: { caption: string; url: string }[];
  showboatUrl: string;
  commit: string;
  checklistUrl?: string;
}

const markdownText = (value: string) => value.replace(/[\\[\]<>]/g, '\\$&');
export const proofCaption = (caption: string) => caption
  .replace(/\nCaptured from https?:\/\/[^\s]+(?:; checked maintainer deployment [a-f0-9]{64})?\s*$/, '').trim();

export function implementationProofImageUrl(repository: string, commit: string, sha256: string, publicRepository: boolean) {
  // API consumers receive relative Markdown unchanged. Public images need no
  // page base URL, GitHub cookie, redirect or expiring download token.
  if (publicRepository)
    return `https://raw.githubusercontent.com/${repository}/${commit}/images/${sha256}.png`;
  // Preserve GitHub's authenticated rendering for private repositories.
  return `../blob/${commit}/images/${sha256}.png?raw=true`;
}

// Review assets live in the same repository as the PR. GitHub can render them
// without a DEOS session, and private repositories keep their own access rules.
// A content-addressed, separate branch preserves the implementation's exact head.
export async function publishImplementationProof(
  github: ImplementationGitHub,
  store: ImplementationStore,
  work: ImplementationRun,
  candidate: ImplementationCandidate,
  plan: ChecklistPlan | null = null,
): Promise<PublishedImplementationProof> {
  // Legacy candidates remain readable; new runtimes emit the checklist from the
  // saved plan. Validate before any GitHub write, including proof asset uploads.
  if (candidate.evidenceChecklist)
    requireEvidenceChecklist(candidate.evidenceChecklist, plan, candidate.proof);
  const images = candidate.proof.filter(proof => proof.kind === 'browser_image');
  // Old command captures include validation logs. Only deliberately selected
  // behavior demonstrations belong in the reviewer document.
  const records = candidate.proof.filter(proof => proof.kind === 'showboat' && proof.audience === 'review');
  const publicRepository = (await github.json<{private: boolean}>('')).private === false;
  const manifest = JSON.stringify({version: 4, runId: work.run_id,
    proof: [...images, ...records].map(({id, kind, sha256, caption, change, approvedDesignSha, testedBaseSha, treeSha}) =>
      ({id, kind, sha256, caption, change, approvedDesignSha, testedBaseSha, treeSha})),
    ...(candidate.evidenceChecklist ? {checklist:candidate.evidenceChecklist, omissions:candidate.proofOmissions ?? []} : {})});
  const digest = await sha256Hex(manifest);
  const branch = `deos/proof/${work.linear_identifier}/run-${work.issue_run_sequence}/${digest}`;
  let commit = await github.ref(branch, true);
  if (commit) {
    if (await github.file('manifest.json', commit) !== manifest)
      throw new ImplementationError('proof_publication_conflict', 'The saved proof branch contains a different manifest');
  } else {
    const tree: {path: string; mode: '100644'; type: 'blob'; sha: string}[] = [];
    const upload = async (path: string, bytes: Uint8Array) => {
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      const blob = await github.json<{sha: string}>('/git/blobs', {
        method: 'POST', body: JSON.stringify({encoding: 'base64', content: btoa(binary)}),
      });
      tree.push({path, mode: '100644', type: 'blob', sha: blob.sha});
    };
    const uploaded = new Set<string>();
    const showboat = [`# ${work.linear_identifier} behavior proof`, ...images.map((proof, index) =>
      `${index + 1}. ${markdownText(proofCaption(proof.caption))}\n\n   ![${markdownText(proofCaption(proof.caption))}](images/${proof.sha256}.png)`),
    ];
    for (const proof of images) {
      if (uploaded.has(proof.sha256)) continue;
      await upload(`images/${proof.sha256}.png`, await store.readBytes(proof.path, proof.sha256));
      uploaded.add(proof.sha256);
    }
    for (const proof of records) {
      const content = new TextDecoder().decode(await store.readBytes(proof.path, proof.sha256));
      showboat.push(`<a id="evidence-${await sha256Hex(proof.id)}"></a>\n\n${content}`);
    }
    if (candidate.evidenceChecklist) {
      const links = new Map(await Promise.all([
        ...images.map(async proof => [proof.id, `images/${proof.sha256}.png`] as const),
        ...records.map(async proof => [proof.id, `showboat.md#evidence-${await sha256Hex(proof.id)}`] as const),
      ]));
      await upload('evidence-checklist.json', new TextEncoder().encode(JSON.stringify(candidate.evidenceChecklist, null, 2)));
      await upload('evidence-checklist.md', new TextEncoder().encode(
        evidenceChecklistMarkdown(candidate.evidenceChecklist, id => links.get(id)!)));
    }
    await upload('showboat.md', new TextEncoder().encode(showboat.join('\n\n') + '\n'));
    await upload('manifest.json', new TextEncoder().encode(manifest));
    const savedTree = await github.json<{sha: string}>('/git/trees', {
      method: 'POST', body: JSON.stringify({tree}),
    });
    const identity = {name: 'DEOS Workflow', email: 'deos-workflow[bot]@users.noreply.github.com', date: work.created_at};
    const savedCommit = await github.json<{sha: string}>('/git/commits', {
      method: 'POST', body: JSON.stringify({message: `${work.linear_identifier} behavior proof`,
        tree: savedTree.sha, parents: [], author: identity, committer: identity}),
    });
    try {
      await github.json('/git/refs', {method: 'POST', body: JSON.stringify({ref: `refs/heads/${branch}`, sha: savedCommit.sha})});
    } catch (error) {
      // A lost successful response is safe to reconcile only to this exact commit.
      let recovered: string | null;
      try { recovered = await github.ref(branch, true); }
      catch (readError) {
        throw new AggregateError([error, readError], 'Proof branch publication failed and its outcome could not be read back', {cause: error});
      }
      if (recovered !== savedCommit.sha) throw error;
    }
    commit = await github.ref(branch);
    if (commit !== savedCommit.sha)
      throw new ImplementationError('proof_publication_conflict', 'GitHub proof branch differs from the published commit');
  }
  return {
    commit,
    images: images.map(proof => ({caption: proofCaption(proof.caption),
      url: implementationProofImageUrl(github.repository, commit, proof.sha256, publicRepository)})),
    showboatUrl: `https://github.com/${github.repository}/blob/${commit}/showboat.md`,
    ...(candidate.evidenceChecklist ? {checklistUrl:`https://github.com/${github.repository}/blob/${commit}/evidence-checklist.md`} : {}),
  };
}

export function implementationProofMarkdown(proof: PublishedImplementationProof) {
  return proof.images.map((image, index) =>
    `${index + 1}. ${markdownText(image.caption)}\n\n${' '.repeat(String(index + 1).length + 2)}![${markdownText(image.caption)}](${image.url})`);
}
