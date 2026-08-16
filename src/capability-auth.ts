export interface CapabilityClaims {
  version: 1;
  issuer: "deos";
  audience: "sandbox-capabilities";
  attemptId: string;
  runId: string;
  repository: string;
  issueId: string;
  expiresAt: number;
}

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const base64UrlDecode = (value: string): Uint8Array => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const hmacKey = (secret: string, usage: "sign" | "verify"): Promise<CryptoKey> => {
  if (secret.length < 32) throw new Error("capability signing secret is too short");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
};

export const mintCapabilityToken = async (
  claims: CapabilityClaims,
  secret: string,
): Promise<string> => {
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`;
};

export const verifyCapabilityToken = async (
  token: string,
  secret: string,
  nowMs = Date.now(),
): Promise<CapabilityClaims> => {
  const [encoded, encodedSignature, extra] = token.split(".");
  if (!encoded || !encodedSignature || extra !== undefined) throw new Error("capability token is malformed");
  const verified = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(encoded),
  );
  if (!verified) throw new Error("capability token signature is invalid");
  let claims: CapabilityClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as CapabilityClaims;
  } catch {
    throw new Error("capability token payload is invalid");
  }
  if (
    claims.version !== 1 ||
    claims.issuer !== "deos" ||
    claims.audience !== "sandbox-capabilities" ||
    !claims.attemptId ||
    !claims.runId ||
    !claims.repository ||
    !claims.issueId ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.expiresAt <= Math.floor(nowMs / 1000)
  ) throw new Error("capability token claims are invalid or expired");
  return claims;
};
