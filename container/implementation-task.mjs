import { constants } from 'node:fs';
import { open, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Runs as the author, not root. One real task transition per request; this does
// not decide whether the work is good enough or synthesize intermediate counts.
export function transitionTask(markdown, request) {
  if (!request || Object.keys(request).some(k => !['action','taskId','state'].includes(k)) ||
      request.action !== 'task' || typeof request.taskId !== 'string' || !/^\d+(?:\.\d+)+$/.test(request.taskId) ||
      !['active','completed','pending'].includes(request.state))
    throw new Error('task requires one taskId (for example 1.2) and state active, completed or pending');
  const lines = markdown.split('\n');
  const tasks = [];
  let fence = null;
  for (const [line, text] of lines.entries()) {
    const marker = text.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const task = text.match(/^(\s*- \[)([ xX])(\]\s+)(\S.*)$/);
    if (task) tasks.push({line, completed:task[2].toLowerCase() === 'x', text:task[4], match:task,
      id:task[4].match(/^(\d+(?:\.\d+)+)(?:\s|$)/)?.[1]});
  }
  const matches = tasks.filter(t => t.id === request.taskId);
  if (matches.length !== 1) throw new Error(`Task ${request.taskId} must identify exactly one checklist item; found ${matches.length}`);
  const task = matches[0];
  const completed = request.state === 'completed';
  if (request.state === 'active' && task.completed)
    throw new Error(`Task ${request.taskId} is completed; reopen it with state pending before marking active`);
  const changed = request.state !== 'active' && completed !== task.completed;
  if (changed) lines[task.line] = task.match[1] + (completed ? 'x' : ' ') + task.match[3] + task.match[4];
  const content = lines.join('\n');
  return {content, changed, taskId:request.taskId, state:request.state, text:task.text,
    completed:tasks.filter(t => t === task && changed ? completed : t.completed).length,
    total:tasks.length, tasksSha:createHash('sha256').update(content).digest('hex')};
}

export async function updateTask(cwd, change, request) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(change)) throw new Error('Invalid task change');
  const path = join(cwd,'openspec','changes',change,'tasks.md');
  const within = relative(await realpath(cwd),await realpath(path));
  if (within.startsWith('..') || within.startsWith('/')) throw new Error('Task checklist escaped repository');
  const file = await open(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  let markdown;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1_048_576) throw new Error('Task checklist must be a bounded regular file');
    markdown = await file.readFile('utf8');
  } finally { await file.close(); }
  const {content,...result} = transitionTask(markdown,request);
  if (result.changed) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary,content,{flag:'wx',mode:0o644});
    await rename(temporary,path);
  }
  return {...result,observedAt:new Date().toISOString()};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const request = JSON.parse(await readFile(process.argv[4],'utf8'));
  process.stdout.write(JSON.stringify(await updateTask(process.argv[2],process.argv[3],request))+'\n');
}
