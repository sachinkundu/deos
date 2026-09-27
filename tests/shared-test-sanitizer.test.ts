import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile as callbackExecFile} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';
import sharp from 'sharp';

const execFile=promisify(callbackExecFile);
const script=new URL('../scripts/sanitize-shared-test-proof.mjs',import.meta.url).pathname;

test('trusted sanitizer masks private text and rejects unknown OCR text',async(t)=>{
  try {await execFile('tesseract',['--version']);}
  catch {t.skip('Tesseract is not installed on this test host');return;}
  const directory=await mkdtemp(join(tmpdir(),'deos-proof-'));
  try {
    const image=await sharp(Buffer.from(`<svg width="600" height="260" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="260" fill="white"/>
      <text x="30" y="65" font-family="Arial" font-size="42" fill="black">SAC-182</text>
      <text x="30" y="120" font-family="Arial" font-size="42" fill="black">Ready</text>
      <text x="30" y="185" font-family="Arial" font-size="36" fill="black">private@example.com</text>
      </svg>`)).png().toBuffer();
    const input=join(directory,'source.png'),recipePath=join(directory,'recipe.json');
    const output=join(directory,'public.png'),manifest=join(directory,'manifest.json');
    await writeFile(input,image);
    const recipe={version:1,sourceSha256:createHash('sha256').update(image).digest('hex'),
      width:600,height:260,crop:{x:0,y:0,width:600,height:230},
      masks:[{x:0,y:135,width:600,height:95}],
      allowedText:['SAC-182','Ready'],requiredText:['SAC-182','Ready']};
    await writeFile(recipePath,JSON.stringify(recipe));
    await execFile(process.execPath,[script,input,recipePath,output,manifest]);
    const result=JSON.parse(await readFile(manifest,'utf8'));
    assert.equal(result.passed,true);
    assert.deepEqual(result.recognizedText,['SAC-182','Ready']);
    assert.notEqual(result.publicSha256,recipe.sourceSha256);
    assert.equal((await sharp(await readFile(output)).metadata()).width,600);
    await writeFile(recipePath,JSON.stringify({...recipe,masks:[]}));
    await assert.rejects(execFile(process.execPath,[script,input,recipePath,
      join(directory,'unsafe.png'),join(directory,'unsafe.json')]),
    /proof_ocr_text_not_allowlisted/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
