export const sharedTestProofOrigin='https://deos-shared-test-proof.skundu.workers.dev';

export function sharedTestProofUrl(proofId:string):string {
  if(!/^[a-f0-9-]{36}$/i.test(proofId))
    throw new Error('test_proof_id_invalid');
  return `${sharedTestProofOrigin}/proof/${proofId}`;
}
