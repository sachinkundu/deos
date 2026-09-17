import { request } from "node:http";

export function implementationExitCode(statusCode, result) {
  if (statusCode < 200 || statusCode >= 300) return 1;
  if (['queued', 'running'].includes(result.state)) return 75;
  const code = result.result?.exitCode ?? result.exitCode;
  if (Number.isInteger(code) && code !== 0) return code > 0 && code < 126 ? code : 1;
  return ['failed', 'canceled', 'interrupted'].includes(result.state) ? 1 : 0;
}

export async function waitImplementationOperation(initial, port = 8790, intervalMs = 1000) {
  let response = initial;
  for (;;) {
    const record = JSON.parse(response.text);
    if (response.statusCode !== 200 || !['queued', 'running'].includes(record.state)) return response;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    response = await implementationRequest(JSON.stringify({action:'operation', requestId:record.requestId}), port);
  }
}

// Only the trusted local runner sets the command deadline. Node fetch has a
// shorter implicit headers timeout and can abandon a still-running build.
export function implementationRequest(body, port = 8790) {
  const action = JSON.parse(body).action;
  const path = action === "safe_test" ? "/provider-test" : "/tool";
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "POST", agent: false,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("error", error => reject(Object.assign(error, {
        statusCode: response.statusCode, partialBody: Buffer.concat(chunks).toString(),
      })));
      response.once("end", () => resolve({ statusCode: response.statusCode, text: Buffer.concat(chunks).toString() }));
    });
    req.once("error", reject);
    if (['check','demo','operation','status','cancel'].includes(action))
      req.setTimeout(10_000, () => req.destroy(new Error('Local tool response timed out after 10000ms; retrieve the same requestId before retrying work')));
    req.end(body);
  });
}
