import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadWorkflowDefinition} from '../../src/workflow-definition.ts';

const root=fileURLToPath(new URL('../../config/',import.meta.url));
const bundle=Object.fromEntries(['prompts','schemas'].map(folder=>[folder,
  Object.fromEntries(readdirSync(root+folder).map(file=>[folder+'/'+file,readFileSync(root+folder+'/'+file,'utf8')]))]));
const manifest=[];
for(const file of readdirSync(root).filter(file=>/^workflow\..*\.yaml$/.test(file))) {
  const definition=await loadWorkflowDefinition(readFileSync(root+file,'utf8'),bundle);
  manifest.push({file,name:definition.name,version:definition.version,digest:definition.digest});
}
console.log(JSON.stringify(manifest));
