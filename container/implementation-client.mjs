import { request } from "node:http";

// Only the trusted local runner sets the command deadline. Node fetch has a
// shorter implicit headers timeout and can abandon a still-running build.
export function implementationRequest(body, port = 8790) {
  const path = JSON.parse(body).action === "safe_test" ? "/provider-test" : "/tool";
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
    req.end(body);
  });
}
