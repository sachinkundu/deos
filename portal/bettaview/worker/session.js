import { base64url } from "./github-core.js";

const json = (status, body) => Response.json(body, { status });

function randomValue(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64url(value);
}

export class GitHubSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/start" && request.method === "POST") {
      const { returnTo, redirectUri } = await request.json();
      const state = randomValue();
      const verifier = randomValue(48);
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      await this.state.storage.put("oauth", { state, verifier, returnTo, redirectUri, createdAt: Date.now() });
      return json(200, { state, challenge });
    }
    if (url.pathname === "/callback" && request.method === "POST") {
      const { state, code } = await request.json();
      const oauth = await this.state.storage.get("oauth");
      if (!oauth || oauth.state !== state || Date.now() - oauth.createdAt > 10 * 60 * 1000) {
        return json(400, { error: "invalid_oauth_state" });
      }
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.env.GITHUB_CLIENT_ID,
          client_secret: this.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: oauth.redirectUri,
          code_verifier: oauth.verifier,
        }),
      });
      const token = await response.json();
      if (!response.ok || typeof token.access_token !== "string") {
        return json(502, { error: "github_token_exchange_failed" });
      }
      const now = Date.now();
      await this.state.storage.put("token", {
        accessToken: token.access_token,
        accessExpiresAt: now + Number(token.expires_in || 28_800) * 1000,
        refreshToken: token.refresh_token || null,
        refreshExpiresAt: token.refresh_token
          ? now + Number(token.refresh_token_expires_in || 15_552_000) * 1000
          : null,
      });
      await this.state.storage.delete("oauth");
      return json(200, { returnTo: oauth.returnTo || "/" });
    }
    if (url.pathname === "/token" && request.method === "GET") {
      let token = await this.state.storage.get("token");
      if (!token) return json(401, { error: "github_authorization_required" });
      if (token.accessExpiresAt - Date.now() < 5 * 60 * 1000) {
        if (!token.refreshToken || !token.refreshExpiresAt || token.refreshExpiresAt <= Date.now()) {
          await this.state.storage.delete("token");
          return json(401, { error: "github_reauthorization_required" });
        }
        const response = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: this.env.GITHUB_CLIENT_ID,
            client_secret: this.env.GITHUB_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: token.refreshToken,
          }),
        });
        const refreshed = await response.json();
        if (!response.ok || typeof refreshed.access_token !== "string") {
          await this.state.storage.delete("token");
          return json(401, { error: "github_reauthorization_required" });
        }
        const now = Date.now();
        token = {
          accessToken: refreshed.access_token,
          accessExpiresAt: now + Number(refreshed.expires_in || 28_800) * 1000,
          refreshToken: refreshed.refresh_token || token.refreshToken,
          refreshExpiresAt: refreshed.refresh_token
            ? now + Number(refreshed.refresh_token_expires_in || 15_552_000) * 1000
            : token.refreshExpiresAt,
        };
        await this.state.storage.put("token", token);
      }
      return json(200, { accessToken: token.accessToken, expiresAt: token.accessExpiresAt });
    }
    if (url.pathname === "/clear" && request.method === "POST") {
      await this.state.storage.deleteAll();
      return json(200, { cleared: true });
    }
    return json(404, { error: "session_route_not_found" });
  }
}
