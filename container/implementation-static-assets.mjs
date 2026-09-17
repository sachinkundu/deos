import {readdir,readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Freeze a finished build before handing it to the trusted publisher. Never
// follow links out of the build tree or upload repository/configuration files.
export async function collectStaticAssets(cwd,directory) {
  if(typeof directory!=='string' || !directory) throw new Error('publish_preview requires a build directory');
  const root=await realpath(cwd),target=await realpath(resolve(root,directory));
  if(target===root || relative(root,target).startsWith('..')) throw new Error('Use a dedicated build directory inside the repository');
  const files=[];let size=0;
  async function walk(folder) {
    for(const name of (await readdir(folder)).sort()) {
      const path=join(folder,name),stat=await lstat(path);
      if(stat.isSymbolicLink() || name.startsWith('.')) throw new Error(`Preview may not include hidden files or symlinks: ${relative(target,path)}`);
      if(stat.isDirectory()) await walk(path);
      else if(stat.isFile()) {
        size+=stat.size;
        if(stat.size>2_000_000 || size>8_000_000 || files.length>=128) throw new Error('Preview exceeds the static build size limit');
        files.push({path:relative(target,path),contentBase64:(await readFile(path)).toString('base64')});
      } else throw new Error('Preview contains a non-file entry');
    }
  }
  await walk(target);
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(JSON.stringify(await collectStaticAssets(process.argv[2],process.argv[3])));
}
