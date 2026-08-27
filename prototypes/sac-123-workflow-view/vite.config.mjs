import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const recordedAttemptId = "01a03852-9204-7612-bbb6-b76579f1462a";

const durableTranscriptPreview = () => ({
  name: "durable-transcript-preview",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const match = url.pathname.match(/^\/api\/attempts\/([0-9a-f-]{36})\/transcript(\.jsonl)?$/i);
      if (match === null) return next();
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.statusCode = 405;
        return response.end();
      }
      const file = process.env.DEOS_TRANSCRIPT_DEV_FILE;
      const expectedDigest = process.env.DEOS_TRANSCRIPT_DEV_SHA256;
      if (match[1] !== recordedAttemptId || !file || !expectedDigest) {
        response.statusCode = 404;
        response.setHeader("Content-Type", "application/json");
        return response.end(JSON.stringify({ error: "transcript_not_found" }));
      }
      try {
        const bytes = await readFile(file);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== expectedDigest.toLowerCase()) throw new Error("digest mismatch");
        if (match[2] === ".jsonl") {
          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Disposition", `attachment; filename="SAC-130-${recordedAttemptId}-transcript.jsonl"`);
          response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
          return response.end(request.method === "HEAD" ? undefined : bytes);
        }
        const records = bytes.toString("utf8").split(/\r?\n/).filter((line) => line.trim()).map((raw, index) => ({
          number: index + 1,
          raw,
          value: JSON.parse(raw),
        }));
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json");
        return response.end(request.method === "HEAD" ? undefined : JSON.stringify({
          attemptId: recordedAttemptId,
          runId: "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:8009635e-3567-4dd7-83de-5d9e8274a165:run:3",
          runSequence: 3,
          issueKey: "SAC-130",
          nodeId: "planning_agent",
          byteSize: bytes.byteLength,
          sha256: digest,
          eventCount: records.length,
          records,
        }));
      } catch {
        response.statusCode = 503;
        response.setHeader("Content-Type", "application/json");
        return response.end(JSON.stringify({ error: "transcript_unavailable" }));
      }
    });
  },
});

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [durableTranscriptPreview(), react()],
});
