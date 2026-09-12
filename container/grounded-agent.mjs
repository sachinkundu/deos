import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const hash = value => createHash('sha256').update(value).digest('hex');
export async function provisionGrounding(policy, { root = '/deos/agent-skills', home = '/root/.codex' } = {}) {
    if (!policy)
        return null;
    if (policy.schema !== 'deos-grounding-v1' || policy.webSearch !== 'native-live' || !Array.isArray(policy.skills) || !policy.skills.length)
        throw new Error('invalid frozen grounding policy');
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    const ids = new Set();
    const effective = [];
    for (const pinned of policy.skills) {
        if (ids.has(pinned.id))
            throw new Error('duplicate frozen skill');
        ids.add(pinned.id);
        const skill = manifest.find(item => item.id === pinned.id);
        if (!skill || skill.sha256 !== pinned.sha256 || hash(JSON.stringify(skill.files)) !== skill.sha256)
            throw new Error(`frozen skill digest mismatch: ${pinned.id}`);
        for (const file of skill.files) {
            if (file.path.startsWith('/') || file.path.split('/').includes('..'))
                throw new Error('invalid skill path');
            const bytes = await readFile(path.join(root, skill.id, file.path));
            if (hash(bytes) !== file.sha256)
                throw new Error(`skill content hash mismatch: ${skill.id}/${file.path}`);
            const destination = path.join(home, 'skills', skill.id, file.path);
            await mkdir(path.dirname(destination), { recursive: true });
            await writeFile(destination, bytes, { mode: 0o600 });
        }
        effective.push({ id: skill.id, sha256: skill.sha256, path: path.join(home, 'skills', skill.id, 'SKILL.md') });
    }
    return { schema: policy.schema, webSearch: policy.webSearch, skills: effective, capabilityDigest: hash(JSON.stringify(policy)) };
}
export function verifyGroundingContext(context, policy) {
    const bundle = JSON.parse(context);
    if (bundle.agentInputs?.schema !== 'deos-grounding-v1' || JSON.stringify(bundle.agentInputs.policy) !== JSON.stringify(policy) || !Array.isArray(bundle.agentInputs.checkedContextFiles))
        throw new Error('grounding input manifest mismatch');
    const paths = new Set();
    return bundle.agentInputs.checkedContextFiles.map(file => {
        if (typeof file.path !== 'string' || file.path.startsWith('/') || file.path.split('/').includes('..') || paths.has(file.path) || typeof file.content !== 'string' || hash(file.content) !== file.sha256)
            throw new Error('checked context file mismatch');
        paths.add(file.path);
        return { path: file.path, sha256: file.sha256 };
    });
}
/** Read the effective capabilities from the same pinned native runtime used by the job. */
export async function verifyNativeGrounding(manifest, cwd, { codex = 'codex' } = {}) {
    const child = spawn(codex, ['app-server', '--config', 'web_search="live"'], { stdio: ['pipe', 'pipe', 'inherit'] });
    const lines = createInterface({ input: child.stdout });
    const iterator = lines[Symbol.asyncIterator]();
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
    let startupError;
    child.once('error', error => { startupError = error; });
    const rpc = async (id, method, params) => {
        if (startupError)
            throw startupError;
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
        for (;;) {
            const line = await iterator.next();
            if (line.done)
                throw new Error('native grounding capability readback ended early', { cause: startupError });
            const response = JSON.parse(line.value);
            if (response.id !== id)
                continue;
            if (response.error)
                throw new Error('native grounding capability readback failed', { cause: response.error });
            return response.result;
        }
    };
    try {
        await rpc(1, 'initialize', { clientInfo: { name: 'deos-grounding', version: '1' }, capabilities: { experimentalApi: true } });
        child.stdin.write('{"method":"initialized"}\n');
        const config = await rpc(2, 'config/read', { cwd, includeLayers: true });
        if (config.config?.web_search !== 'live')
            throw new Error('required native web search unavailable');
        const discovered = await rpc(3, 'skills/list', { cwds: [cwd], forceReload: true });
        const entry = discovered.data?.find(item => item.cwd === cwd);
        if (!entry || entry.errors?.length)
            throw new Error('native skill discovery failed', { cause: entry?.errors });
        for (const skill of manifest.skills) {
            if (!entry.skills.some(item => item.path === skill.path && item.enabled === true))
                throw new Error(`required native skill unavailable: ${skill.id}`);
        }
        return { ...manifest, runtime: 'codex', verification: { webSearch: config.config.web_search,
                skills: entry.skills.filter(item => manifest.skills.some(skill => skill.path === item.path)).map(({ name, path, enabled }) => ({ name, path, enabled })) } };
    }
    finally {
        clearTimeout(timer);
        lines.close();
        child.kill('SIGTERM');
    }
}
