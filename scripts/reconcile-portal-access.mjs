const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "c68856288112af7698f5be52ea94b96e";
const zoneId = process.env.CLOUDFLARE_ZONE_ID ?? "8a120356c46d1557fbf7fec6cbed7a19";
const token = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_TOKEN;
const hostname = "deos.voxdez.com";
const service = "deos-workflow-portal";
const allowedEmail = "sachinkundu@gmail.com";
const teamDomain = "deos-voxdez.cloudflareaccess.com";
const googleProviderName = "DEOS Google";
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");

const request = async (method, path, body) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`Cloudflare ${method} ${path} failed with HTTP ${response.status}`);
  }
  return payload.result;
};

const organization = await request("GET", `/accounts/${accountId}/access/organizations`);
if (organization.auth_domain !== teamDomain) {
  throw new Error(`Expected Access team domain ${teamDomain}`);
}

const providers = await request("GET", `/accounts/${accountId}/access/identity_providers`);
let provider = providers.find(
  (candidate) => candidate.type === "google" && candidate.name === googleProviderName,
);
if (!provider) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required to create the Google identity provider");
  }
  provider = await request("POST", `/accounts/${accountId}/access/identity_providers`, {
    type: "google",
    name: googleProviderName,
    config: { client_id: clientId, client_secret: clientSecret },
  });
}

const applications = await request("GET", `/accounts/${accountId}/access/apps`);
let application = applications.find((candidate) => candidate.domain === hostname);
const applicationBody = {
  name: "DEOS Workflow Portal",
  domain: hostname,
  destinations: [{ type: "public", uri: hostname }],
  type: "self_hosted",
  session_duration: "24h",
  allowed_idps: [provider.id],
  auto_redirect_to_identity: true,
  app_launcher_visible: false,
  allow_authenticate_via_warp: false,
  enable_binding_cookie: true,
  http_only_cookie_attribute: true,
};
if (!application) {
  application = await request("POST", `/accounts/${accountId}/access/apps`, applicationBody);
} else {
  application = await request(
    "PUT",
    `/accounts/${accountId}/access/apps/${application.id}`,
    applicationBody,
  );
}

const policies = await request("GET", `/accounts/${accountId}/access/apps/${application.id}/policies`);
let policy = policies.find((candidate) => candidate.name === "Allow Sachin only");
const policyBody = {
  name: "Allow Sachin only",
  decision: "allow",
  precedence: 1,
  include: [{ email: { email: allowedEmail } }],
  exclude: [],
  require: [{ login_method: { id: provider.id } }],
  session_duration: "24h",
};
if (!policy) {
  policy = await request(
    "POST",
    `/accounts/${accountId}/access/apps/${application.id}/policies`,
    policyBody,
  );
} else {
  policy = await request(
    "PUT",
    `/accounts/${accountId}/access/apps/${application.id}/policies/${policy.id}`,
    policyBody,
  );
}

const domains = await request("GET", `/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(hostname)}`);
let domain = domains.find((candidate) => candidate.hostname === hostname);
if (!domain) {
  domain = await request("PUT", `/accounts/${accountId}/workers/domains`, {
    hostname,
    service,
    zone_id: zoneId,
  });
}

process.stdout.write(JSON.stringify({
  hostname,
  service: domain.service,
  teamDomain: organization.auth_domain,
  audience: application.aud,
  identityProvider: { id: provider.id, name: provider.name, type: provider.type },
  allowedEmail: policy.include?.[0]?.email?.email,
}));
