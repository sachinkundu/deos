import type { WriteStream } from "node:fs";
export function atomicJson(path: string, value: unknown): Promise<void>;
interface Capture {
  stream: WriteStream;
  finalize(destination: string, replace?: boolean): Promise<void>;
}
export function captureSupervisorStreams(tempRoot?: string): Promise<{ transcript: Capture; validation: Capture }>;
export function recordHeartbeat(write: () => Promise<void>, recordError?: (error: unknown, location: string) => void): Promise<void>;
