const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

const sha256 = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

const base32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

export const correlationIdentity = (projectId: string, issueId: string): string => {
  if (projectId.length === 0 || issueId.length === 0) {
    throw new Error("project and issue identifiers are required");
  }
  return `workflow:${projectId}:${issueId}`;
};

export const runIdentity = (correlationId: string, sequence: number): string => {
  if (correlationId.length === 0 || !Number.isInteger(sequence) || sequence < 1) {
    throw new Error("run identity requires a correlation id and positive sequence");
  }
  return `${correlationId}:run:${sequence}`;
};

export const workflowInstanceIdentity = async (runId: string): Promise<string> =>
  `wf-v1-${base32(await sha256(runId))}`;

export const sandboxIdentity = async (attemptId: string): Promise<string> =>
  `sbx-v1-${base32(await sha256(attemptId))}`;

export const operationIdentity = (
  runId: string,
  nodeId: string,
  logicalOperation: string,
  ordinal: number,
): string => {
  if ([runId, nodeId, logicalOperation].some((value) => value.length === 0)) {
    throw new Error("operation identity fields must not be empty");
  }
  if (!Number.isInteger(ordinal) || ordinal < 1) throw new Error("operation ordinal must be positive");
  return `${runId}:${nodeId}:${logicalOperation}:${ordinal}`;
};

export const uuidV7 = (
  timestampMs = Date.now(),
  randomBytes?: Uint8Array,
): string => {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0 || timestampMs > 0xffffffffffff) {
    throw new Error("UUIDv7 timestamp is out of range");
  }
  const bytes = randomBytes === undefined
    ? crypto.getRandomValues(new Uint8Array(16))
    : new Uint8Array(randomBytes);
  if (bytes.length !== 16) throw new Error("UUIDv7 requires 16 random bytes");
  let timestamp = timestampMs;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
