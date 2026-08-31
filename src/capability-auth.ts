export interface CapabilityClaims {
  version: 1;
  issuer: "deos";
  audience: "sandbox-capabilities";
  attemptId: string;
  runId: string;
  repository: string;
  issueId: string;
  actions: readonly CapabilityAction[];
  changeId: string | null;
  planningBranch: string | null;
  modelProvider?: "openrouter" | null;
  model?: string | null;
  reasoning?: string | null;
  expiresAt: number;
}

export type CapabilityAction =
  | "github.clone_repository"
  | "github.publish_work_product"
  | "github.publish_planning_work_product"
  | "linear.upsert_working_note"
  | "model.openrouter_review";

const CAPABILITY_ACTIONS = new Set<CapabilityAction>([
  "github.clone_repository",
  "github.publish_work_product",
  "github.publish_planning_work_product",
  "linear.upsert_working_note",
  "model.openrouter_review",
]);

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
    !Array.isArray(claims.actions) ||
    claims.actions.length === 0 ||
    claims.actions.some((action) => !CAPABILITY_ACTIONS.has(action)) ||
    new Set(claims.actions).size !== claims.actions.length ||
    !(claims.changeId === null || typeof claims.changeId === "string") ||
    !(claims.planningBranch === null || typeof claims.planningBranch === "string") ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.expiresAt <= Math.floor(nowMs / 1000)
  ) throw new Error("capability token claims are invalid or expired");
  const planning = claims.actions.includes("github.publish_planning_work_product");
  const modelReview = claims.actions.includes("model.openrouter_review");
  const workActions = claims.actions.filter((action) => action !== "github.clone_repository");
  if (
    planning !== (claims.changeId !== null && claims.planningBranch !== null) ||
    (planning && workActions.length !== 1) ||
    (claims.changeId !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(claims.changeId)) ||
    (claims.planningBranch !== null && !/^deos\/planning\/[a-f0-9]{24}$/.test(claims.planningBranch)) ||
    (modelReview && workActions.length !== 1) ||
    (modelReview && (
      claims.modelProvider !== "openrouter" ||
      typeof claims.model !== "string" || !/^[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+$/.test(claims.model) ||
      typeof claims.reasoning !== "string" || claims.reasoning.length === 0 || claims.reasoning.length > 80
    )) ||
    (!modelReview && (
      claims.modelProvider !== undefined && claims.modelProvider !== null ||
      claims.model !== undefined && claims.model !== null ||
      claims.reasoning !== undefined && claims.reasoning !== null
    ))
  ) throw new Error("capability token planning claims are invalid");
  return claims;
};
