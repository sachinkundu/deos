import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface RecentIssuesIdentityConfig { teamDomain: string; audience: string; allowedEmail: string }
export const recentIssuesPersonKey = async (
  assertion: string | null, config: RecentIssuesIdentityConfig, providedKeys?: JWTVerifyGetKey,
): Promise<string> => {
  if (!assertion || assertion.length > 16_000) throw new Error("unauthorized");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(config.teamDomain)) throw new Error("authentication unavailable");
  const issuer = `https://${config.teamDomain}`;
  const keys = providedKeys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(assertion, keys, { issuer, audience: config.audience, algorithms: ["RS256"] });
  if (typeof payload.email !== "string" || payload.email.toLowerCase() !== config.allowedEmail.toLowerCase()) throw new Error("forbidden");
  if (typeof payload.sub !== "string" || !payload.sub.trim() || payload.sub.includes("\0")) throw new Error("Stable Access subject is required");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${issuer}\0${payload.sub}`));
  return `access:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
};
