import {sharedTestProofUrl} from './shared-test-proof-url.ts';

export interface ImageProofRecipe {
  version:1;sourceSha256:string;width:number;height:number;
  crop:{x:number;y:number;width:number;height:number};
  masks:{x:number;y:number;width:number;height:number}[];
  allowedText:string[];requiredText:string[];
}
interface SanitizerManifest {
  version:number;sanitizerVersion:string;sourceSha256:string;
  publicSha256:string;width:number;height:number;
  recognizedText:string[];passed:boolean;
}
interface RawProof {
  proof_id:string;run_id:string;lease_id:string;kind:string;
  classification:string;sanitizer_result:string|null;
  source_sha256:string;object_key:string;public_sha256:string|null;
}
export interface ImageSanitizerRunner {
  run(proofId:string,source:Uint8Array,recipe:ImageProofRecipe):Promise<{
    image:Uint8Array;manifest:SanitizerManifest}>;
}

async function sha256(bytes:Uint8Array):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0'))
    .join('');
}
function base64(bytes:Uint8Array):string {
  let binary='';
  for(let i=0;i<bytes.length;i+=32768)
    binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
}

/** Separate trusted Sandbox; the demo agent never sees raw or safe image bytes. */
export class CloudflareImageSanitizerRunner implements ImageSanitizerRunner {
  readonly namespace:Env['ImplementationSandbox'];
  constructor(namespace:Env['ImplementationSandbox']) {this.namespace=namespace;}

  async run(proofId:string,source:Uint8Array,recipe:ImageProofRecipe) {
    if(!/^[a-f0-9-]{36}$/i.test(proofId))
      throw new Error('proof_sandbox_identity_invalid');
    const {getSandbox}=await import('@cloudflare/sandbox');
    const sandbox=getSandbox(this.namespace,`test-proof-${proofId}`,{
      normalizeId:true,keepAlive:false});
    const root=`/tmp/test-proof-${proofId}`;
    let primary:unknown;
    try {
      await sandbox.mkdir(root,{recursive:true});
      await sandbox.writeFile(`${root}/source.png`,base64(source),{encoding:'base64'});
      await sandbox.writeFile(`${root}/recipe.json`,JSON.stringify(recipe));
      const command:[string,...string[]]=['node','/deos/bin/sanitize-shared-test-proof.mjs',
        `${root}/source.png`,`${root}/recipe.json`,`${root}/safe.png`,
        `${root}/manifest.json`];
      const process=await sandbox.exec(command,{timeout:120_000});
      const output=await process.output({encoding:'utf8',timeout:125_000,
        maxBytes:16_384});
      if(output.exitCode!==0 || output.timedOut || output.truncated)
        throw Object.assign(new Error(`test_image_sanitizer_failed:${output.exitCode}:`+
          output.stderr),{command,output});
      const [imageFile,manifestFile]=await Promise.all([
        sandbox.readFile(`${root}/safe.png`,{encoding:'base64'}),
        sandbox.readFile(`${root}/manifest.json`,{encoding:'utf8'}),
      ]);
      return {image:Uint8Array.from(atob(imageFile.content),char=>char.charCodeAt(0)),
        manifest:JSON.parse(manifestFile.content) as SanitizerManifest};
    }catch(error){primary=error;throw error;}
    finally {
      try {await sandbox.destroy();}
      catch(error) {
        if(primary)throw new AggregateError([primary,error],
          'Image sanitizer and Sandbox cleanup failed',{cause:primary});
        throw error;
      }
    }
  }
}

/** Only the passed new bytes can become a proof URL. */
export class SharedTestImageSanitizer {
  readonly db:D1Database;
  readonly bucket:R2Bucket;
  readonly runner:ImageSanitizerRunner;
  constructor(db:D1Database,bucket:R2Bucket,runner:ImageSanitizerRunner) {
    this.db=db;this.bucket=bucket;this.runner=runner;
  }

  async project(proofId:string,recipe:ImageProofRecipe,
    at=new Date()):Promise<string> {
    const row=await this.db.prepare(`SELECT proof_id,run_id,lease_id,kind,
      classification,sanitizer_result,source_sha256,object_key,public_sha256
      FROM test_proof_items WHERE proof_id=?`).bind(proofId).first<RawProof>();
    if(!row || row.kind!=='app_screen' || row.classification!=='private' ||
        row.sanitizer_result!=='pending' || row.public_sha256 ||
        recipe.sourceSha256!==row.source_sha256)
      throw new Error('test_image_proof_scope_invalid');
    const raw=await this.bucket.get(row.object_key);
    if(!raw)throw new Error('test_image_proof_source_missing');
    const source=new Uint8Array(await raw.arrayBuffer());
    if(await sha256(source)!==row.source_sha256)
      throw new Error('test_image_proof_source_changed');
    const {image,manifest}=await this.runner.run(proofId,source,recipe);
    const publicSha=await sha256(image);
    if(image.byteLength<100 || image.byteLength>8_000_000 ||
        publicSha===row.source_sha256 ||
        ![0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>
          image[index]===byte) ||
        manifest.version!==1 || manifest.sanitizerVersion!=='fixed-mask-ocr-v1' ||
        manifest.sourceSha256!==row.source_sha256 ||
        manifest.publicSha256!==publicSha || manifest.passed!==true ||
        manifest.width!==recipe.crop.width || manifest.height!==recipe.crop.height ||
        !Array.isArray(manifest.recognizedText) ||
        manifest.recognizedText.some(line=>!recipe.allowedText.includes(line)) ||
        recipe.requiredText.some(line=>!manifest.recognizedText.includes(line)))
      throw new Error('test_image_proof_sanitizer_result_invalid');
    const key=`shared-test/public/${encodeURIComponent(row.lease_id)}/${proofId}.png`;
    const publicUrl=sharedTestProofUrl(proofId);
    const created=await this.bucket.put(key,image,{onlyIf:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'image/png'},
      customMetadata:{sha256:publicSha,evidenceClass:'public-safe'}});
    if(!created) {
      const prior=await this.bucket.get(key);
      if(!prior || await sha256(new Uint8Array(await prior.arrayBuffer()))!==publicSha)
        throw new Error('test_image_proof_object_conflict');
    }
    const saved=await this.bucket.get(key);
    if(!saved || await sha256(new Uint8Array(await saved.arrayBuffer()))!==publicSha)
      throw new Error('test_image_proof_readback_failed');
    const updated=await this.db.prepare(`UPDATE test_proof_items SET
      classification='public_safe',view_rule='access_protected',
      sanitizer_version=?,sanitizer_result='passed',public_sha256=?,
      public_url=?,projected_at=? WHERE proof_id=? AND run_id=? AND lease_id=?
        AND classification='private' AND sanitizer_result='pending'
        AND source_sha256=? AND public_sha256 IS NULL`)
      .bind(manifest.sanitizerVersion,publicSha,publicUrl,at.toISOString(),proofId,
        row.run_id,row.lease_id,row.source_sha256).run();
    if(updated.meta.changes!==1)
      throw new Error('test_image_proof_projection_conflict');
    return publicUrl;
  }
}
