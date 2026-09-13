import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
const CAPTURE_ROOT = '/deos/run/supervisor-capture';
const OUTPUT_ROOT = '/deos/output';
async function publish(source, destination, replace = true) {
    if (!replace) {
        try { await access(destination); return; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const bytes = await readFile(source);
    await writeFile(`${destination}.capture-tmp`, bytes, { mode: 0o600 });
    await rename(`${destination}.capture-tmp`, destination);
}
export async function trustedCapture(name, root = CAPTURE_ROOT) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const path = `${root}/${name}`;
    const stream = createWriteStream(path, { flags: 'wx', mode: 0o600 });
    // Retain the source until sandbox cleanup, including after normal finalization.
    return { stream, async finalize(destination, replace = true) {
        await finished(stream);
        await publish(path, destination, replace);
    } };
}
export async function recoverCaptures(root = CAPTURE_ROOT, output = OUTPUT_ROOT) {
    await mkdir(output, { recursive: true, mode: 0o700 });
    const errors = [];
    for (const [source, destination, replace] of [
        ['transcript.jsonl', 'transcript.jsonl', true],
        ['stderr.txt', 'supervisor-stderr.txt', true], ['stderr.txt', 'validation.txt', false],
    ]) {
        try { await publish(`${root}/${source}`, `${output}/${destination}`, replace); }
        catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Supervisor capture recovery failed', { cause: errors[0] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await recoverCaptures();
}
