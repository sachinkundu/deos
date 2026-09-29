import {sha256Hex} from './implementation-hash.ts';

export const sharedTestReviewMethods=['accountSettings','connectAccount','prepareReview','refreshHead','requestPermit',
  'completeGitHubPart','failGitHubPart','markGitHubReady','retryLinear','abandon'] as const;
const encode=new TextEncoder();
const hex=(value:ArrayBuffer)=>[...new Uint8Array(value)]
  .map(byte=>byte.toString(16).padStart(2,'0')).join('');
const canonical=(value:unknown):string=>{
  if(value===null || ['string','number','boolean'].includes(typeof value))return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(typeof value==='object')return `{${Object.keys(value as object).sort().map(key=>
    `${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
  throw new Error('test_review_assertion_body_invalid');
};
async function hmac(secret:string,value:string) {
  if(!secret || secret.length<32)throw new Error('test_review_signing_key_missing');
  const key=await crypto.subtle.importKey('raw',encode.encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,encode.encode(value)));
}

/** Lease-local authentication only; this is never the production service key. */
export async function sharedTestReviewKey(parent:string,leaseId:string,fence:number) {
  if(!/^[a-f0-9]{64}$/.test(leaseId) || !Number.isSafeInteger(fence) || fence<1)
    throw new Error('test_review_key_subject_invalid');
  return hmac(parent,`deos-lease-review-service-v1:${leaseId}:${fence}`);
}

export async function sharedTestReviewAssertion(secret:string,githubUserId:number,
  method:string,body:unknown) {
  if(!sharedTestReviewMethods.includes(method as typeof sharedTestReviewMethods[number]))
    throw new Error('test_review_method_denied');
  const unsigned={version:1,keyVersion:1,method,bodyDigest:await sha256Hex(canonical(body)),
    accessAccount:'reviewer@deos-test.invalid',githubUserId,issuedAt:Date.now(),
    nonce:crypto.randomUUID()};
  return {...unsigned,mac:await hmac(secret,canonical(unsigned))};
}
