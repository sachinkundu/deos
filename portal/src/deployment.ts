export interface PortalDeploymentEnv {
  PORTAL_SITE?: string;
  PORTAL_CANONICAL_HOST?: string;
  PORTAL_SOURCE_BRANCH?: string;
  PORTAL_SOURCE_SHA?: string;
  CF_VERSION_METADATA?: { id: string };
}

export function deploymentMetadata(env: PortalDeploymentEnv) {
  return {
    site: env.PORTAL_SITE === "Staging" || env.PORTAL_SITE === "Production"
      ? env.PORTAL_SITE : "Development",
    canonicalHost: env.PORTAL_CANONICAL_HOST ?? "localhost",
    sourceBranch: env.PORTAL_SOURCE_BRANCH ?? "local",
    sourceSha: env.PORTAL_SOURCE_SHA ?? "unbuilt",
    versionId: env.CF_VERSION_METADATA?.id ?? null,
  };
}

export function labelPortalHtml(html: string, env: PortalDeploymentEnv): string {
  const { site } = deploymentMetadata(env);
  return html.replace("</head>", `<meta name="deos-site" content="${site}"></head>`)
    .replace(/<title>([^<]*)<\/title>/, `<title>$1 · ${site}</title>`);
}
