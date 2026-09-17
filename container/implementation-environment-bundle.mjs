import { readFile, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectStaticAssets } from './implementation-static-assets.mjs';

export async function collectEnvironmentBundle(cwd, request) {
  if(Object.keys(request).some(k=>!['action','requestId','main','assets','d1','r2'].includes(k)))throw new Error('Unsupported environment field');
  if(typeof request.main!=='string'||!request.main||request.main.startsWith('/')||request.main.split('/').includes('..'))throw new Error('main must name a bundled JavaScript file inside the repository');
  const root=await realpath(cwd),path=await realpath(resolve(root,request.main));
  if(relative(root,path).startsWith('..'))throw new Error('Worker bundle leaves the repository');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let code;
  try {
    const stat=await handle.stat();
    if(!stat.isFile()||stat.size>2_000_000)throw new Error('Worker bundle must be a regular file up to 2 MB');
    code=await handle.readFile('utf8');
  } finally {await handle.close();}
  return {code,config:{d1:request.d1??[],r2:request.r2??[]},
    ...(request.assets?{assets:await collectStaticAssets(cwd,request.assets)}:{})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(JSON.stringify(await collectEnvironmentBundle(process.argv[2],JSON.parse(await readFile(process.argv[3],'utf8')))));
