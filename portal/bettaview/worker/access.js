import { createRemoteJWKSet, jwtVerify } from "jose";

export async function verifyAccess(token, config, providedKeys) {
  if (!token || token.length > 16_000) throw new Error("unauthorized");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(config.teamDomain)) {
    throw new Error("authentication unavailable");
  }
  const issuer = `https://${config.teamDomain}`;
  const keys = providedKeys || createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    audience: config.audience,
    algorithms: ["RS256"],
  });
  if (typeof payload.email !== "string" || payload.email.toLowerCase() !== config.allowedEmail.toLowerCase()) {
    throw new Error("forbidden");
  }
  return { email: payload.email };
}
