// Credential-free startup probe. Run inside the DEOS image with --network none.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { provisionGrounding } from '/deos/bin/grounded-agent.mjs';
const manifest = JSON.parse(await readFile('/deos/agent-skills/manifest.json', 'utf8'));
const policy = { schema: 'deos-grounding-v1', webSearch: 'native-live', skills: manifest.map(({ id, sha256 }) => ({ id, sha256 })) };
await provisionGrounding(policy, { home: '/tmp/claude-probe' });
await mkdir('/evidence', { recursive: true });
await writeFile('/tmp/claude-probe/request.json', JSON.stringify({ type: 'user', message: { role: 'user', content: 'This is a local startup probe.' } }) + '\n');
const child = spawn('claude', ['-p', '--verbose', '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--model', 'claude-opus-5', '--permission-mode', 'dontAsk', '--tools', 'WebSearch,Read,Skill', '--allowedTools', 'WebSearch', 'Skill',
    'Read(/tmp/claude-probe/skills/**)', '--setting-sources', 'user', '--no-chrome'], {
    env: { PATH: process.env.PATH, HOME: '/tmp/claude-probe', CLAUDE_CONFIG_DIR: '/tmp/claude-probe', CLAUDE_CODE_OAUTH_TOKEN: 'synthetic-invalid-token' },
    stdio: ['pipe', 'pipe', 'pipe'],
});
child.stdin.end(await readFile('/tmp/claude-probe/request.json'));
let stdout = '', stderr = '', init;
child.stdout.on('data', bytes => {
    stdout += bytes;
    for (const line of stdout.split('\n').slice(0, -1)) {
        const event = JSON.parse(line);
        if (event.type === 'system' && event.subtype === 'init') {
            init = event;
            child.kill('SIGTERM');
        }
    }
});
child.stderr.on('data', bytes => { stderr += bytes; });
const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
clearTimeout(timer);
await writeFile('/evidence/claude-startup.jsonl', stdout);
await writeFile('/evidence/claude-startup-stderr.txt', stderr);
const evidence = { evidenceClass: 'credential-free-offline-native-startup', init,
    passed: !!init?.tools?.includes('WebSearch') && !!init?.tools?.includes('Skill') && policy.skills.every(skill => init?.skills?.includes(skill.id)) };
await writeFile('/evidence/claude-grounding.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
process.exitCode = evidence.passed ? 0 : 1;
