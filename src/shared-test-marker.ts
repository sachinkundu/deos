import {sha256Hex} from './implementation-hash.ts';

export interface TestMarkerSubject {
  expectationId:string;
  runId:string;
  leaseId:string;
  taskId:string;
  fence:number;
}

function hex(bytes:ArrayBuffer):string {
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function testIssueMarker(subject:TestMarkerSubject,key:string):Promise<string> {
  if (!/^[a-zA-Z0-9._:-]{8,120}$/.test(subject.expectationId) ||
      !subject.runId || !subject.leaseId || !subject.taskId ||
      !Number.isSafeInteger(subject.fence) || subject.fence<1 || !key)
    throw new Error('invalid_test_marker_subject');
  const cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=JSON.stringify([1,subject.expectationId,subject.runId,subject.leaseId,
    subject.taskId,subject.fence]);
  const mac=hex(await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(signed)));
  return `<!-- deos-test-v1:${subject.expectationId}:${mac} -->`;
}

export function insertTestMarker(description:string,marker:string):string {
  if (!/^<!-- deos-test-v1:[a-zA-Z0-9._:-]{8,120}:[a-f0-9]{64} -->$/.test(marker))
    throw new Error('invalid_test_marker');
  if (description.includes(marker)) {
    const lines=description.split('\n').filter(line=>line===marker);
    if (lines.length!==1) throw new Error('test_marker_ambiguous');
    return description;
  }
  if (description.includes('<!-- deos-test-v1:')) throw new Error('foreign_test_marker_present');
  return `${description}${description && !description.endsWith('\n')?'\n':''}${marker}\n`;
}

export function removeTestMarker(description:string,marker:string):string {
  const lines=description.split('\n');
  const matches=lines.flatMap((line,index)=>line===marker?[index]:[]);
  if (matches.length!==1) throw new Error('test_marker_missing_or_ambiguous');
  const index=matches[0];
  lines.splice(index,1);
  return lines.join('\n');
}

export async function testMarkerHashes(before:string,after:string,marker:string):Promise<{
  beforeSha256:string;afterSha256:string;markerSha256:string}> {
  return {beforeSha256:await sha256Hex(before),afterSha256:await sha256Hex(after),
    markerSha256:await sha256Hex(marker)};
}

export function markerIsStandalone(description:string,marker:string):boolean {
  return description.split('\n').filter(line=>line===marker).length===1;
}
