import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AccessConfiguration {
  teamDomain: string;
  audience: string;
  allowedEmail: string;
}

export const verifyAccess = async (
  token: string | null,
  config: AccessConfiguration,
  providedKeys?: JWTVerifyGetKey,
): Promise<{ email: string }> => {
  if (token === null || token.length > 16_000) throw new Error("unauthorized");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(config.teamDomain)) {
    throw new Error("authentication unavailable");
  }
  const issuer = `https://${config.teamDomain}`;
  const keys = providedKeys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    audience: config.audience,
    algorithms: ["RS256"],
  });
  if (typeof payload.email !== "string" || payload.email.toLowerCase() !== config.allowedEmail.toLowerCase()) {
    throw new Error("forbidden");
  }
  return { email: payload.email };
};
