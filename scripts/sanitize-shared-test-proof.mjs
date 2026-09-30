#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFile,unlink,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';

const run=promisify(execFile);
const args=process.argv.slice(2);
if(args.length!==4 || args.some(value=>!value))
  throw new Error('Usage: sanitize-shared-test-proof INPUT.png RECIPE.json OUTPUT.png MANIFEST.json');
const [inputPath,recipePath,outputPath,manifestPath]=args;
const source=await readFile(inputPath);
if(source.length<100 || source.length>8_000_000)
  throw new Error('proof_source_size_invalid');
const sourceSha256=createHash('sha256').update(source).digest('hex');
const recipe=JSON.parse(await readFile(recipePath,'utf8'));
const keys=Object.keys(recipe).sort();
if(JSON.stringify(keys)!==JSON.stringify(['allowedText','crop','height','masks',
  'requiredText','sourceSha256','version','width'].sort()) ||
  recipe.version!==1 || recipe.sourceSha256!==sourceSha256)
  throw new Error('proof_recipe_invalid');
const integer=(value)=>Number.isSafeInteger(value) && value>=0;
const rectangle=(value,bounds)=>value && typeof value==='object' &&
  Object.keys(value).sort().join(',')==='height,width,x,y' &&
  [value.x,value.y,value.width,value.height].every(integer) &&
  value.width>0 && value.height>0 && value.x+value.width<=bounds.width &&
  value.y+value.height<=bounds.height;
if(!integer(recipe.width) || !integer(recipe.height) ||
  recipe.width<320 || recipe.height<240 ||
  recipe.width*recipe.height>16_000_000 ||
  !rectangle(recipe.crop,{width:recipe.width,height:recipe.height}) ||
  !Array.isArray(recipe.masks) || recipe.masks.length>32 ||
  recipe.masks.some(mask=>!rectangle(mask,{width:recipe.crop.width,
    height:recipe.crop.height})))
  throw new Error('proof_geometry_invalid');
const metadata=await sharp(source,{limitInputPixels:16_000_000}).metadata();
if(metadata.format!=='png' || metadata.width!==recipe.width ||
  metadata.height!==recipe.height ||
  (metadata.pages!==undefined && metadata.pages!==1))
  throw new Error('proof_source_format_invalid');
const normalize=(text)=>text.normalize('NFKC').replace(/\s+/gu,' ').trim();
if(!Array.isArray(recipe.allowedText) || !Array.isArray(recipe.requiredText) ||
  recipe.allowedText.length<1 || recipe.allowedText.length>80 ||
  recipe.requiredText.length<1 || recipe.requiredText.length>20 ||
  [...recipe.allowedText,...recipe.requiredText].some(value=>
    typeof value!=='string' || !value || value.length>160))
  throw new Error('proof_text_allowlist_invalid');
const allowed=new Set(recipe.allowedText.map(normalize));
const required=new Set(recipe.requiredText.map(normalize));
if([...required].some(value=>!allowed.has(value)))
  throw new Error('proof_required_text_not_allowed');
const {crop}=recipe;
const maskSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="${crop.width}" height="${crop.height}">`+
  recipe.masks.map(mask=>`<rect x="${mask.x}" y="${mask.y}" width="${mask.width}" height="${mask.height}" fill="white"/>`).join('')+
  '</svg>';
const publicPng=await sharp(source,{limitInputPixels:16_000_000})
  .extract({left:crop.x,top:crop.y,width:crop.width,height:crop.height})
  .flatten({background:'#fff'})
  .composite([{input:Buffer.from(maskSvg),left:0,top:0}])
  .png({compressionLevel:9,adaptiveFiltering:false}).toBuffer();
// OCR reads a fixed two-times raster of the newly encoded public bytes so small
// UI labels remain legible. The published PNG keeps its original geometry.
// Unknown or uncertain text still blocks release at the same confidence limit.
const ocrPath=`${outputPath}.ocr-input.png`;
const ocrPng=await sharp(publicPng).resize(crop.width*2,crop.height*2).png().toBuffer();
await writeFile(ocrPath,ocrPng,{flag:'wx'});
let tsv;
let ocrError;
try {
  ({stdout:tsv}=await run('tesseract',[ocrPath,'stdout','tsv'],{
    maxBuffer:4_000_000,timeout:90_000}));
} catch(error) {
  ocrError=error;
  throw error;
} finally {
  try {await unlink(ocrPath);}
  catch(error) {
    if(ocrError)throw new AggregateError([ocrError,error],
      'OCR and temporary image cleanup failed',{cause:ocrError});
    throw error;
  }
}
// Keep trailing tabs: Tesseract may emit an empty final text field.
const rows=tsv.split(/\r?\n/u).filter(line=>line.length>0).map(line=>line.split('\t'));
const header=rows.shift();
if(!header || header.join('\t')!=='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext')
  throw new Error('proof_ocr_format_invalid');
const lines=new Map();
for(const row of rows) {
  if(row[0]!=='5')continue;
  if(row.length<12)throw new Error('proof_ocr_format_invalid');
  if(!normalize(row.slice(11).join('\t')))continue;
  const confidence=Number(row[10]);
  if(!Number.isFinite(confidence) || confidence<80)
    throw Object.assign(new Error('proof_ocr_uncertain'),{
      confidence,bounds:{x:Number(row[6])/2,y:Number(row[7])/2,
        width:Number(row[8])/2,height:Number(row[9])/2},
    });
  const key=row.slice(1,5).join(':');
  lines.set(key,[...(lines.get(key)??[]),normalize(row.slice(11).join('\t'))]);
}
const recognized=[...lines.values()].map(words=>normalize(words.join(' ')));
if(recognized.length===0 || recognized.some(line=>!allowed.has(line)) ||
  [...required].some(line=>!recognized.includes(line)))
  throw new Error('proof_ocr_text_not_allowlisted');
const publicSha256=createHash('sha256').update(publicPng).digest('hex');
await writeFile(outputPath,publicPng,{flag:'wx'});
await writeFile(manifestPath,JSON.stringify({version:1,sanitizerVersion:'fixed-mask-ocr-v2',
  sourceSha256,publicSha256,width:crop.width,height:crop.height,
  recognizedText:recognized,passed:true})+'\n',{flag:'wx'});
