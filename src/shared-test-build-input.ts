import type {StagingServiceRead} from './shared-test-lease.ts';

export interface SharedTestBuildFile {
  path:string;
  contentBase64:string;
}

export interface SharedTestBuildInput {
  serviceName:string;
  sourceCommit:string;
  files:readonly SharedTestBuildFile[];
}

const paths:Record<string,{worker:string;assets:string;migrations:string|null;
  modules:string|null}>={
  portal:{worker:'portal-worker/worker.js',assets:'portal/dist/',migrations:'migrations/',
    modules:null},
  bettaview:{worker:'portal/bettaview/worker/index.js',
    assets:'portal/bettaview/dist/',migrations:null,
    modules:'portal/bettaview/worker/'},
};

function bytes(value:string):Uint8Array {
  if (!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error('invalid_test_build_file_encoding');
  const decoded=atob(value);
  return Uint8Array.from(decoded,character=>character.charCodeAt(0));
}

function lengthBytes(value:number,count:number):Uint8Array {
  const result=new Uint8Array(count);
  let remaining=BigInt(value);
  for (let index=count-1;index>=0;index--) {
    result[index]=Number(remaining & 255n);
    remaining >>= 8n;
  }
  return result;
}

function hex(value:ArrayBuffer):string {
  return [...new Uint8Array(value)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** pathlib sorts path components, so portal/dist sorts before portal-worker. */
function pythonPathOrder(a:string,b:string):number {
  const left=a.split('/'),right=b.split('/');
  for (let index=0;index<Math.min(left.length,right.length);index++) {
    if (left[index]!==right[index])
      return left[index]<right[index]?-1:1;
  }
  return left.length-right.length;
}

/** Same source-and-file digest as scripts/portal_release.py:artifact_digest. */
export async function verifiedSharedTestBuild(input:SharedTestBuildInput,
  base:StagingServiceRead):Promise<{worker:Uint8Array;
    assets:ReadonlyMap<string,Uint8Array>;
    modules:ReadonlyMap<string,Uint8Array>;
    migrations:ReadonlyMap<string,Uint8Array>;sha256:string}> {
  const scope=paths[input.serviceName];
  if (!scope || input.serviceName!==base.serviceName ||
      input.sourceCommit!==base.sourceCommit ||
      !/^[a-f0-9]{40}$/.test(input.sourceCommit) ||
      !/^[a-f0-9]{64}$/.test(base.buildInputSha256) ||
      !Array.isArray(input.files) || input.files.length<(scope.migrations?3:2) ||
      input.files.length>2000)
    throw new Error('invalid_test_build_subject');
  const files=new Map<string,Uint8Array>();
  let total=0;
  for (const file of input.files) {
    if (!file || typeof file.path!=='string' ||
        !(file.path===scope.worker || file.path.startsWith(scope.assets) ||
          (scope.migrations && file.path.startsWith(scope.migrations) &&
            file.path.endsWith('.sql')) ||
          (scope.modules && file.path.startsWith(scope.modules) &&
            file.path.endsWith('.js'))) ||
        file.path.endsWith('/') || file.path.includes('\\') ||
        file.path.split('/').includes('..') || files.has(file.path))
      throw new Error('invalid_test_build_path');
    const content=bytes(file.contentBase64);
    total+=content.byteLength;
    if (total>20_000_000) throw new Error('test_build_input_too_large');
    files.set(file.path,content);
  }
  const worker=files.get(scope.worker);
  if (!worker?.byteLength || ![...files.keys()].some(path=>path.startsWith(scope.assets)) ||
      (scope.migrations && !files.has('migrations/0001_initial.sql')))
    throw new Error('test_build_input_incomplete');
  const encoder=new TextEncoder();
  const chunks:Uint8Array[]=[encoder.encode(input.sourceCommit)];
  for (const [path,content] of [...files.entries()].sort(([a],[b])=>pythonPathOrder(a,b))) {
    const relative=encoder.encode(path);
    chunks.push(lengthBytes(relative.length,4),relative,
      lengthBytes(content.length,8),content);
  }
  const combined=new Uint8Array(chunks.reduce((size,chunk)=>size+chunk.length,0));
  let offset=0;
  for (const chunk of chunks) {combined.set(chunk,offset);offset+=chunk.length;}
  const sha256=hex(await crypto.subtle.digest('SHA-256',combined));
  if (sha256!==base.buildInputSha256)
    throw new Error('test_build_input_digest_mismatch');
  return {worker,assets:new Map([...files.entries()].filter(([path])=>path.startsWith(scope.assets))),
    modules:new Map([...files.entries()].filter(([path])=>
      scope.modules && path.startsWith(scope.modules))),
    migrations:new Map([...files.entries()].filter(([path])=>
      scope.migrations && path.startsWith(scope.migrations))),sha256};
}
