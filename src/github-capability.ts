export interface GitHubWorkProductRequest {
  repository: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  files: readonly { path: string; content: string }[];
}

export interface GitHubWorkProductReceipt {
  pullRequestId: string;
  pullRequestUrl: string;
  branch: string;
  reconciled: boolean;
}

export interface GitHubPlanningWorkProductRequest {
  repository: string;
  branch: string;
  baseBranch: "main";
  title: string;
  body: string;
  files: readonly { path: string; content: string }[];
  reviewReplies: readonly { commentId: number; body: string }[];
  change: string;
  expectedPullRequestDatabaseId?: string;
  expectedPullRequestNumber?: number;
}

export interface GitHubPlanningWorkProductReceipt {
  pullRequestDatabaseId: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  branch: string;
  headSha: string;
  reviewReplyIds: readonly number[];
  reconciled: boolean;
}

export interface GitHubDesignWorkProductRequest {
  repository: string;
  branch: string;
  baseBranch: "main";
  baseCommit: string;
  title: string;
  body: string;
  change: string;
  content: string;
  reviewReplies: readonly { commentId: number; body: string }[];
  expectedPullRequestDatabaseId?: string;
  expectedPullRequestNumber?: number;
}

interface GitHubReviewComment {
  id: number;
  inReplyToId: number | null;
  body: string;
  userType: string;
  userLogin: string;
}

export interface GitHubPlanningMergeReceipt {
  pullRequestDatabaseId: string;
  pullRequestNumber: number;
  mergeCommitSha: string;
  reconciled: boolean;
}

export interface GitHubCommitReachability {
  defaultHeadSha: string;
  reachable: boolean;
}

export interface GitHubGuidanceFile {
  path: string;
  content: string;
}

export interface GitHubPlanningPullRequest {
  databaseId: string;
  number: number;
  url: string;
  state: string;
  draft: boolean;
  merged: boolean;
  mergeCommitSha: string | null;
  headBranch: string;
  headSha: string;
  baseBranch: string;
}

export interface GitHubCheckRunReceipt {
  checkRunId: string;
  url: string;
  reconciled: boolean;
}

export interface GitHubTokenProvider {
  token(): Promise<string>;
  actorLogin?(): Promise<string>;
}

export interface GitHubRepositoryChoice {
  repositoryId: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  disabled: boolean;
  installationId: string;
  accountLogin: string;
  permissions: Readonly<Record<string, string>>;
  settingsUrl: string;
  access: "ready" | "weak_permissions";
}

export interface GitHubInstallationChoice {
  installationId: string;
  accountLogin: string;
  accountType: "User" | "Organization";
  targetType: "User" | "Organization";
  repositorySelection: "all" | "selected";
  permissions: Readonly<Record<string, string>>;
  settingsUrl: string;
  suspended: boolean;
  repositories: readonly GitHubRepositoryChoice[];
}

export interface GitHubRepositoryAccessCheck {
  state: "passed" | "missing" | "weak_permissions";
  repository: GitHubRepositoryChoice | null;
  settingsUrl: string | null;
  permissions: Readonly<Record<string, string>> | null;
}

const REQUIRED_ROUTE_PERMISSIONS = Object.freeze({
  checks: "write",
  contents: "write",
  metadata: "read",
  pull_requests: "write",
} as const);

const permissionRank = (value: string | undefined): number =>
  value === "admin" ? 3 : value === "write" ? 2 : value === "read" ? 1 : 0;

const routePermissionsReady = (permissions: Readonly<Record<string, string>>): boolean =>
  Object.entries(REQUIRED_ROUTE_PERMISSIONS).every(([name, needed]) =>
    permissionRank(permissions[name]) >= permissionRank(needed));

const installationSettingsUrlReady = (
  value: string,
  installationId: string,
  accountLogin: string,
  targetType: "User" | "Organization",
): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== "https://github.com" || url.search !== "" || url.hash !== "") return false;
  const expected = targetType === "Organization"
    ? `/organizations/${accountLogin}/settings/installations/${installationId}`
    : `/settings/installations/${installationId}`;
  return url.pathname === expected;
};

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const base64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodePem = (pem: string): { label: string; bytes: Uint8Array } => {
  const match = pem.match(/-----BEGIN ([A-Z ]+)-----([\s\S]+?)-----END \1-----/);
  if (match === null) throw new Error("GitHub App private key PEM is invalid");
  const binary = atob(match[2].replace(/\s/g, ""));
  return { label: match[1], bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
};

const derLength = (length: number): Uint8Array => {
  if (length < 128) return Uint8Array.of(length);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
};

const der = (tag: number, content: Uint8Array): Uint8Array =>
  Uint8Array.of(tag, ...derLength(content.length), ...content);

const pkcs1ToPkcs8 = (pkcs1: Uint8Array): Uint8Array => {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaAlgorithm = Uint8Array.of(
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  );
  return der(0x30, Uint8Array.of(...version, ...rsaAlgorithm, ...der(0x04, pkcs1)));
};

export class GitHubAppTokenProvider implements GitHubTokenProvider {
  private readonly apiUrl: string;
  private readonly appId: string;
  private readonly privateKey: string;
  private readonly installationId: string;
  private readonly request: typeof fetch;
  private readonly now: () => Date;

  constructor(input: {
    apiUrl: string;
    appId: string;
    privateKey: string;
    installationId: string;
    fetch?: typeof fetch;
    now?: () => Date;
  }) {
    this.apiUrl = input.apiUrl.replace(/\/$/, "");
    this.appId = input.appId;
    this.privateKey = input.privateKey;
    this.installationId = input.installationId;
    this.request = input.fetch ?? ((request, init) => fetch(request, init));
    this.now = input.now ?? (() => new Date());
  }

  async token(): Promise<string> {
    const jwt = await this.appJwt();
    const response = await this.request(
      `${this.apiUrl}/app/installations/${encodeURIComponent(this.installationId)}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "deos-orchestrator",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) throw new Error("GitHub App installation token request failed");
    const payload = await response.json() as { token?: string };
    if (typeof payload.token !== "string" || payload.token.length === 0) {
      throw new Error("GitHub App installation token response is invalid");
    }
    return payload.token;
  }

  async actorLogin(): Promise<string> {
    const jwt = await this.appJwt();
    const response = await this.request(`${this.apiUrl}/app`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "deos-orchestrator",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error("GitHub App identity request failed");
    const payload = await response.json() as { slug?: unknown };
    if (typeof payload.slug !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(payload.slug)) {
      throw new Error("GitHub App identity response is invalid");
    }
    return `${payload.slug}[bot]`;
  }

  async appJwt(): Promise<string> {
    const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const now = Math.floor(this.now().getTime() / 1000);
    const payload = base64Url(new TextEncoder().encode(JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: this.appId,
    })));
    const decoded = decodePem(this.privateKey);
    const keyBytes = decoded.label === "RSA PRIVATE KEY" ? pkcs1ToPkcs8(decoded.bytes) : decoded.bytes;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      keyBytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
  }
}

export class GitHubAppCatalog {
  private readonly apiUrl: string;
  private readonly appId: string;
  private readonly privateKey: string;
  private readonly request: typeof fetch;
  private readonly now: () => Date;

  constructor(input: {
    apiUrl: string;
    appId: string;
    privateKey: string;
    fetch?: typeof fetch;
    now?: () => Date;
  }) {
    this.apiUrl = input.apiUrl.replace(/\/$/, "");
    this.appId = input.appId;
    this.privateKey = input.privateKey;
    this.request = input.fetch ?? ((request, init) => fetch(request, init));
    this.now = input.now ?? (() => new Date());
  }

  tokenProvider(installationId: string): GitHubAppTokenProvider {
    if (!/^[1-9][0-9]{0,19}$/.test(installationId)) {
      throw new Error("GitHub App installation id is invalid");
    }
    return new GitHubAppTokenProvider({
      apiUrl: this.apiUrl,
      appId: this.appId,
      privateKey: this.privateKey,
      installationId,
      fetch: this.request,
      now: this.now,
    });
  }

  async list(): Promise<GitHubInstallationChoice[]> {
    const jwtProvider = this.tokenProvider("1");
    const jwt = await jwtProvider.appJwt();
    const rawInstallations: unknown[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const response = await this.request(
        `${this.apiUrl}/app/installations?per_page=100&page=${page}`,
        { headers: this.headers(jwt) },
      );
      if (!response.ok) throw new Error("GitHub App installation catalog is unavailable");
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error("GitHub App installation catalog is invalid");
      rawInstallations.push(...payload);
      if (payload.length < 100) break;
      if (page === 100) throw new Error("GitHub App installation catalog is too large");
    }
    const installations = await Promise.all(rawInstallations.map((value) => this.installation(value)));
    const ids = installations.map((installation) => installation.installationId);
    if (new Set(ids).size !== ids.length) throw new Error("GitHub App installation catalog has duplicates");
    return installations.sort((left, right) =>
      left.accountLogin.localeCompare(right.accountLogin) ||
      left.installationId.localeCompare(right.installationId));
  }

  async checkRepository(
    installationId: string,
    fullName: string,
  ): Promise<GitHubRepositoryAccessCheck> {
    const installations = await this.list();
    const installation = installations.find((item) => item.installationId === installationId);
    if (installation === undefined) {
      return { state: "missing", repository: null, settingsUrl: null, permissions: null };
    }
    const repository = installation.repositories.find((item) => item.fullName === fullName);
    if (repository === undefined) {
      return {
        state: "missing",
        repository: null,
        settingsUrl: installation.settingsUrl,
        permissions: installation.permissions,
      };
    }
    return {
      state: repository.access === "ready" ? "passed" : "weak_permissions",
      repository,
      settingsUrl: installation.settingsUrl,
      permissions: installation.permissions,
    };
  }

  private async installation(value: unknown): Promise<GitHubInstallationChoice> {
    const item = value as {
      id?: unknown;
      account?: { login?: unknown; type?: unknown };
      target_type?: unknown;
      repository_selection?: unknown;
      permissions?: unknown;
      html_url?: unknown;
      suspended_at?: unknown;
    };
    const installationId = typeof item.id === "number" && Number.isSafeInteger(item.id) && item.id > 0
      ? String(item.id)
      : null;
    const accountType = item.account?.type;
    const targetType = item.target_type;
    const repositorySelection = item.repository_selection;
    if (
      installationId === null || typeof item.account?.login !== "string" ||
      !["User", "Organization"].includes(String(accountType)) ||
      !["User", "Organization"].includes(String(targetType)) ||
      !["all", "selected"].includes(String(repositorySelection)) ||
      typeof item.html_url !== "string" || !installationSettingsUrlReady(
        item.html_url,
        installationId,
        item.account.login,
        targetType as "User" | "Organization",
      ) ||
      typeof item.permissions !== "object" || item.permissions === null ||
      Array.isArray(item.permissions)
    ) throw new Error("GitHub App installation catalog is invalid");
    const permissions = Object.fromEntries(Object.entries(item.permissions).map(([name, level]) => {
      if (typeof level !== "string" || !["read", "write", "admin"].includes(level)) {
        throw new Error("GitHub App installation permissions are invalid");
      }
      return [name, level];
    }).sort(([left], [right]) => left.localeCompare(right)));
    const repositories = await this.repositories(
      installationId,
      item.account.login,
      permissions,
      item.html_url,
    );
    return {
      installationId,
      accountLogin: item.account.login,
      accountType: accountType as "User" | "Organization",
      targetType: targetType as "User" | "Organization",
      repositorySelection: repositorySelection as "all" | "selected",
      permissions,
      settingsUrl: item.html_url,
      suspended: item.suspended_at !== null && item.suspended_at !== undefined,
      repositories,
    };
  }

  private async repositories(
    installationId: string,
    accountLogin: string,
    permissions: Readonly<Record<string, string>>,
    settingsUrl: string,
  ): Promise<GitHubRepositoryChoice[]> {
    const token = await this.tokenProvider(installationId).token();
    const repositories: GitHubRepositoryChoice[] = [];
    let expectedTotal: number | null = null;
    for (let page = 1; page <= 100; page += 1) {
      const response = await this.request(
        `${this.apiUrl}/installation/repositories?per_page=100&page=${page}`,
        { headers: this.headers(token) },
      );
      if (!response.ok) throw new Error("GitHub App repository catalog is unavailable");
      const payload = await response.json() as { total_count?: unknown; repositories?: unknown };
      if (
        !Number.isSafeInteger(payload.total_count) || Number(payload.total_count) < 0 ||
        !Array.isArray(payload.repositories)
      ) throw new Error("GitHub App repository catalog is invalid");
      expectedTotal ??= Number(payload.total_count);
      if (expectedTotal !== Number(payload.total_count)) {
        throw new Error("GitHub App repository catalog changed during paging");
      }
      for (const raw of payload.repositories) {
        const repository = raw as {
          id?: unknown;
          full_name?: unknown;
          default_branch?: unknown;
          private?: unknown;
          archived?: unknown;
          disabled?: unknown;
        };
        if (
          typeof repository.id !== "number" || !Number.isSafeInteger(repository.id) || repository.id <= 0 ||
          typeof repository.full_name !== "string" ||
          !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.full_name) ||
          typeof repository.default_branch !== "string" || repository.default_branch.length === 0 ||
          typeof repository.private !== "boolean" || typeof repository.archived !== "boolean" ||
          typeof repository.disabled !== "boolean"
        ) throw new Error("GitHub App repository catalog is invalid");
        repositories.push({
          repositoryId: String(repository.id),
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          private: repository.private,
          archived: repository.archived,
          disabled: repository.disabled,
          installationId,
          accountLogin,
          permissions,
          settingsUrl,
          access: routePermissionsReady(permissions) && !repository.archived && !repository.disabled
            ? "ready"
            : "weak_permissions",
        });
      }
      if (repositories.length >= expectedTotal) break;
      if (payload.repositories.length === 0 || page === 100) {
        throw new Error("GitHub App repository catalog paging is incomplete");
      }
    }
    if (repositories.length !== expectedTotal) {
      throw new Error("GitHub App repository catalog count is invalid");
    }
    const ids = repositories.map((repository) => repository.repositoryId);
    const names = repositories.map((repository) => repository.fullName);
    if (new Set(ids).size !== ids.length || new Set(names).size !== names.length) {
      throw new Error("GitHub App repository catalog has duplicates");
    }
    return repositories.sort((left, right) => left.fullName.localeCompare(right.fullName));
  }

  private headers(token: string): HeadersInit {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "deos-orchestrator",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}

interface GitHubCapabilityDependencies {
  fetch: typeof fetch;
}

export class GitHubCapabilityAdapter {
  private readonly apiUrl: string;
  private readonly tokens: GitHubTokenProvider;
  private readonly request: typeof fetch;

  constructor(
    apiUrl: string,
    tokens: GitHubTokenProvider,
    dependencies: Partial<GitHubCapabilityDependencies> = {},
  ) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.tokens = tokens;
    this.request = dependencies.fetch ?? ((request, init) => fetch(request, init));
  }

  async publish(
    input: GitHubWorkProductRequest,
    operationId: string,
  ): Promise<GitHubWorkProductReceipt> {
    const token = await this.tokens.token();
    const marker = `<!-- deos-operation:${operationId} -->`;
    const [owner] = input.repository.split("/");
    const base = await this.json(
      token,
      `/repos/${input.repository}/git/ref/heads/${encodeURIComponent(input.baseBranch)}`,
    ) as { object?: { sha?: string } };
    const baseSha = base.object?.sha;
    if (typeof baseSha !== "string") throw new Error("GitHub base ref response is invalid");

    const branchPath = `/repos/${input.repository}/git/ref/heads/${encodeURIComponent(input.branch)}`;
    const branch = await this.json(token, branchPath, undefined, true) as { object?: { sha?: string } } | null;
    if (branch === null) {
      await this.json(token, `/repos/${input.repository}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${input.branch}`, sha: baseSha },
      });
    }

    let reconciled = branch !== null;
    for (const file of input.files) {
      const path = file.path.split("/").map(encodeURIComponent).join("/");
      const contentPath = `/repos/${input.repository}/contents/${path}`;
      const current = await this.json(
        token,
        `${contentPath}?ref=${encodeURIComponent(input.branch)}`,
        undefined,
        true,
      ) as { sha?: string; content?: string } | null;
      const currentContent = current?.content === undefined
        ? null
        : new TextDecoder().decode(Uint8Array.from(atob(current.content.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
      if (currentContent === file.content) {
        reconciled = true;
        continue;
      }
      try {
        await this.json(token, contentPath, {
          method: "PUT",
          body: {
            message: `DEOS work product ${operationId}`,
            content: base64(file.content),
            branch: input.branch,
            ...(current?.sha === undefined ? {} : { sha: current.sha }),
          },
        });
      } catch {
        const after = await this.json(
          token,
          `${contentPath}?ref=${encodeURIComponent(input.branch)}`,
          undefined,
          true,
        ) as { content?: string } | null;
        const afterContent = after?.content === undefined
          ? null
          : new TextDecoder().decode(Uint8Array.from(atob(after.content.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
        if (afterContent !== file.content) throw new Error("GitHub file write is ambiguous");
        reconciled = true;
      }
    }

    const pullsPath = `/repos/${input.repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${input.branch}`)}`;
    const pulls = await this.json(token, pullsPath) as Array<{
      id?: number;
      number?: number;
      html_url?: string;
      body?: string;
    }>;
    let pull = pulls.find((candidate) => candidate.body?.includes(marker));
    if (pull === undefined && pulls.length > 0) {
      const existing = pulls[0];
      if (typeof existing.number !== "number") {
        throw new Error("GitHub pull request response is invalid");
      }
      const updatedBody = `${existing.body ?? input.body}\n\n${marker}`;
      try {
        pull = await this.json(
          token,
          `/repos/${input.repository}/pulls/${existing.number}`,
          { method: "PATCH", body: { body: updatedBody } },
        ) as typeof pull;
      } catch {
        const after = await this.json(token, pullsPath) as typeof pulls;
        pull = after.find((candidate) => candidate.body?.includes(marker));
        if (pull === undefined) throw new Error("GitHub pull request update is ambiguous");
      }
      reconciled = true;
    } else if (pull === undefined) {
      try {
        pull = await this.json(token, `/repos/${input.repository}/pulls`, {
          method: "POST",
          body: {
            title: input.title,
            body: `${input.body}\n\n${marker}`,
            head: input.branch,
            base: input.baseBranch,
            draft: true,
          },
        }) as typeof pull;
      } catch {
        const after = await this.json(token, pullsPath) as typeof pulls;
        pull = after.find((candidate) => candidate.body?.includes(marker));
        if (pull === undefined) throw new Error("GitHub pull request creation is ambiguous");
        reconciled = true;
      }
    } else {
      reconciled = true;
    }
    if (typeof pull?.id !== "number" || typeof pull.html_url !== "string") {
      throw new Error("GitHub pull request response is invalid");
    }
    return {
      pullRequestId: String(pull.id),
      pullRequestUrl: pull.html_url,
      branch: input.branch,
      reconciled,
    };
  }

  async publishPlanning(
    input: GitHubPlanningWorkProductRequest,
    operationId: string,
  ): Promise<GitHubPlanningWorkProductReceipt> {
    const token = await this.tokens.token();
    const [owner] = input.repository.split("/");
    const base = await this.ref(token, input.repository, input.baseBranch);
    let branch = await this.ref(token, input.repository, input.branch, true);
    let reconciled = branch !== null;
    if (branch === null) {
      try {
        await this.json(token, `/repos/${input.repository}/git/refs`, {
          method: "POST",
          body: { ref: `refs/heads/${input.branch}`, sha: base },
        });
      } catch {
        branch = await this.ref(token, input.repository, input.branch, true);
        if (branch === null) throw new Error("GitHub planning branch creation is ambiguous");
        reconciled = true;
      }
      branch = await this.ref(token, input.repository, input.branch);
    }
    if (branch === null) throw new Error("GitHub planning branch is missing");

    const prefix = `openspec/changes/${input.change}/`;
    const tree = await this.json(
      token,
      `/repos/${input.repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    ) as { tree?: Array<{ path?: string; type?: string; sha?: string }> };
    if (!Array.isArray(tree.tree)) throw new Error("GitHub planning tree response is invalid");
    const current = new Map(
      tree.tree
        .filter((entry) => entry.type === "blob" && entry.path?.startsWith(prefix) && typeof entry.sha === "string")
        .map((entry) => [String(entry.path), String(entry.sha)]),
    );
    const desired = new Set(input.files.map((file) => file.path));
    for (const file of input.files) {
      const existing = await this.readContent(token, input.repository, input.branch, file.path, true);
      if (existing?.content === file.content) {
        reconciled = true;
        continue;
      }
      await this.writeContent(
        token,
        input.repository,
        input.branch,
        file.path,
        file.content,
        operationId,
        existing?.sha,
      );
    }
    for (const [path, sha] of [...current].sort(([left], [right]) => left.localeCompare(right))) {
      if (desired.has(path)) continue;
      try {
        await this.json(token, `/repos/${input.repository}/contents/${this.encodedPath(path)}`, {
          method: "DELETE",
          body: {
            message: `DEOS planning manifest ${operationId}`,
            sha,
            branch: input.branch,
          },
        });
      } catch {
        if (await this.readContent(token, input.repository, input.branch, path, true) !== null) {
          throw new Error("GitHub stale planning file deletion is ambiguous");
        }
        reconciled = true;
      }
    }

    const pullsPath = `/repos/${input.repository}/pulls?state=open&base=${encodeURIComponent(input.baseBranch)}&head=${encodeURIComponent(`${owner}:${input.branch}`)}`;
    let pulls: unknown[];
    if (
      input.expectedPullRequestNumber !== undefined ||
      input.expectedPullRequestDatabaseId !== undefined
    ) {
      if (
        input.expectedPullRequestNumber === undefined ||
        input.expectedPullRequestDatabaseId === undefined
      ) throw new Error("GitHub recorded planning pull-request identity is incomplete");
      const recorded = this.parsePull(await this.json(
        token,
        `/repos/${input.repository}/pulls/${input.expectedPullRequestNumber}`,
      ));
      if (
        recorded.databaseId !== input.expectedPullRequestDatabaseId ||
        recorded.number !== input.expectedPullRequestNumber || recorded.state !== "open" ||
        recorded.merged || recorded.headBranch !== input.branch ||
        recorded.baseBranch !== input.baseBranch
      ) throw new Error("GitHub recorded planning pull-request identity mismatch");
      pulls = [{ number: recorded.number }];
    } else {
      pulls = await this.json(token, pullsPath) as unknown[];
    }
    if (!Array.isArray(pulls) || pulls.length > 1) {
      throw new Error("GitHub planning pull-request selection is ambiguous");
    }
    const pullNumber = (value: unknown): number => {
      const number = (value as { number?: unknown }).number;
      if (typeof number !== "number") throw new Error("GitHub planning pull-request response is invalid");
      return number;
    };
    let number = pulls.length === 1 ? pullNumber(pulls[0]) : null;
    if (number === null) {
      try {
        number = pullNumber(await this.json(token, `/repos/${input.repository}/pulls`, {
          method: "POST",
          body: {
            title: input.title,
            body: input.body,
            head: input.branch,
            base: input.baseBranch,
            draft: false,
          },
        }));
      } catch {
        pulls = await this.json(token, pullsPath) as unknown[];
        if (!Array.isArray(pulls) || pulls.length !== 1) {
          throw new Error("GitHub planning pull-request creation is ambiguous");
        }
        number = pullNumber(pulls[0]);
        reconciled = true;
      }
    } else {
      reconciled = true;
    }
    const currentRaw = await this.json(
      token,
      `/repos/${input.repository}/pulls/${number}`,
    ) as { title?: unknown; body?: unknown };
    if (currentRaw.title !== input.title || currentRaw.body !== input.body) {
      try {
        await this.json(
          token,
          `/repos/${input.repository}/pulls/${number}`,
          { method: "PATCH", body: { title: input.title, body: input.body } },
        );
      } catch {
        const afterRaw = await this.json(
          token,
          `/repos/${input.repository}/pulls/${number}`,
        ) as { title?: unknown; body?: unknown };
        if (afterRaw.title !== input.title || afterRaw.body !== input.body) {
          throw new Error("GitHub planning pull-request update is ambiguous");
        }
      }
    }
    const headSha = await this.ref(token, input.repository, input.branch);
    if (headSha === null) throw new Error("GitHub planning branch read-back is missing");
    const confirmed = this.parsePull(await this.json(
      token,
      `/repos/${input.repository}/pulls/${number}`,
    ));
    if (
      confirmed.state !== "open" || confirmed.draft || confirmed.merged ||
      confirmed.headBranch !== input.branch || confirmed.headSha !== headSha ||
      confirmed.baseBranch !== input.baseBranch ||
      (input.expectedPullRequestDatabaseId !== undefined &&
        confirmed.databaseId !== input.expectedPullRequestDatabaseId) ||
      (input.expectedPullRequestNumber !== undefined &&
        confirmed.number !== input.expectedPullRequestNumber)
    ) throw new Error("GitHub planning pull-request read-back mismatch");
    const reviewReplies = await this.replyToReviewThreads(
      token,
      input.repository,
      confirmed.number,
      input.reviewReplies,
      operationId,
    );
    return {
      pullRequestDatabaseId: confirmed.databaseId,
      pullRequestNumber: confirmed.number,
      pullRequestUrl: confirmed.url,
      branch: input.branch,
      headSha,
      reviewReplyIds: reviewReplies.ids,
      reconciled: reconciled || reviewReplies.reconciled,
    };
  }

  async publishDesign(
    input: GitHubDesignWorkProductRequest,
    operationId: string,
  ): Promise<GitHubPlanningWorkProductReceipt> {
    if (!/^[a-f0-9]{40}$/.test(input.baseCommit)) throw new Error("GitHub design base commit is invalid");
    const path = `openspec/changes/${input.change}/design.md`;
    const token = await this.tokens.token();
    const [owner] = input.repository.split("/");
    let branch = await this.ref(token, input.repository, input.branch, true);
    let reconciled = branch !== null;
    if (branch === null) {
      try {
        await this.json(token, `/repos/${input.repository}/git/refs`, {
          method: "POST",
          body: { ref: `refs/heads/${input.branch}`, sha: input.baseCommit },
        });
      } catch {
        branch = await this.ref(token, input.repository, input.branch, true);
        if (branch === null) throw new Error("GitHub design branch creation is ambiguous");
        reconciled = true;
      }
    }
    branch = await this.ref(token, input.repository, input.branch);
    if (branch === null) throw new Error("GitHub design branch is missing");
    await this.assertDesignOnlyBranch(token, input.repository, input.baseCommit, branch, path, false);
    const current = await this.readContent(token, input.repository, input.branch, path, true);
    if (current?.content !== input.content) {
      await this.writeContent(
        token,
        input.repository,
        input.branch,
        path,
        input.content,
        operationId,
        current?.sha,
      );
    } else {
      reconciled = true;
    }
    const pullsPath = `/repos/${input.repository}/pulls?state=all&base=${encodeURIComponent(input.baseBranch)}&head=${encodeURIComponent(`${owner}:${input.branch}`)}`;
    let number: number | null = null;
    if (input.expectedPullRequestDatabaseId !== undefined || input.expectedPullRequestNumber !== undefined) {
      if (input.expectedPullRequestDatabaseId === undefined || input.expectedPullRequestNumber === undefined) {
        throw new Error("GitHub recorded design pull-request identity is incomplete");
      }
      const recorded = this.parsePull(await this.json(
        token,
        `/repos/${input.repository}/pulls/${input.expectedPullRequestNumber}`,
      ));
      if (
        recorded.databaseId !== input.expectedPullRequestDatabaseId || recorded.state !== "open" ||
        recorded.draft || recorded.merged || recorded.headBranch !== input.branch ||
        recorded.baseBranch !== input.baseBranch
      ) throw new Error("GitHub recorded design pull-request identity mismatch");
      number = recorded.number;
      reconciled = true;
    } else {
      const pulls = await this.json(token, pullsPath) as Array<{ number?: unknown }>;
      if (!Array.isArray(pulls) || pulls.length > 1) {
        throw new Error("GitHub design pull-request selection is ambiguous");
      }
      if (pulls.length === 1) {
        if (typeof pulls[0]!.number !== "number") throw new Error("GitHub design pull-request response is invalid");
        number = pulls[0]!.number;
        reconciled = true;
      }
    }
    if (number === null) {
      try {
        const created = await this.json(token, `/repos/${input.repository}/pulls`, {
          method: "POST",
          body: { title: input.title, body: input.body, head: input.branch, base: input.baseBranch, draft: false },
        }) as { number?: unknown };
        if (typeof created.number !== "number") throw new Error("GitHub design pull-request response is invalid");
        number = created.number;
      } catch {
        const pulls = await this.json(token, pullsPath) as Array<{ number?: unknown }>;
        if (!Array.isArray(pulls) || pulls.length !== 1 || typeof pulls[0]!.number !== "number") {
          throw new Error("GitHub design pull-request creation is ambiguous");
        }
        number = pulls[0]!.number;
        reconciled = true;
      }
    }
    const currentPull = await this.json(token, `/repos/${input.repository}/pulls/${number}`) as Record<string, unknown> & {
      title?: unknown;
      body?: unknown;
    };
    const currentIdentity = this.parsePull(currentPull);
    if (
      currentIdentity.state !== "open" || currentIdentity.draft || currentIdentity.merged ||
      currentIdentity.headBranch !== input.branch || currentIdentity.baseBranch !== input.baseBranch
    ) throw new Error("GitHub discovered design pull-request identity mismatch");
    if (currentPull.title !== input.title || currentPull.body !== input.body) {
      try {
        await this.json(token, `/repos/${input.repository}/pulls/${number}`, {
          method: "PATCH",
          body: { title: input.title, body: input.body },
        });
      } catch {
        const after = await this.json(token, `/repos/${input.repository}/pulls/${number}`) as {
          title?: unknown;
          body?: unknown;
        };
        if (after.title !== input.title || after.body !== input.body) {
          throw new Error("GitHub design pull-request update is ambiguous");
        }
        reconciled = true;
      }
    }
    const headSha = await this.ref(token, input.repository, input.branch);
    if (headSha === null) throw new Error("GitHub design branch read-back is missing");
    await this.assertDesignOnlyBranch(token, input.repository, input.baseCommit, headSha, path, true);
    const confirmedRaw = await this.json(token, `/repos/${input.repository}/pulls/${number}`) as Record<string, unknown>;
    const confirmed = this.parsePull(confirmedRaw);
    const design = await this.readContent(token, input.repository, headSha, path, false);
    if (
      confirmed.state !== "open" || confirmed.draft || confirmed.merged ||
      confirmed.headBranch !== input.branch || confirmed.headSha !== headSha ||
      confirmed.baseBranch !== input.baseBranch || design?.content !== input.content ||
      confirmedRaw.title !== input.title || confirmedRaw.body !== input.body ||
      (input.expectedPullRequestDatabaseId !== undefined &&
        confirmed.databaseId !== input.expectedPullRequestDatabaseId) ||
      (input.expectedPullRequestNumber !== undefined && confirmed.number !== input.expectedPullRequestNumber)
    ) throw new Error("GitHub design pull-request read-back mismatch");
    const replies = await this.replyToReviewThreads(
      token,
      input.repository,
      confirmed.number,
      input.reviewReplies,
      operationId,
    );
    return {
      pullRequestDatabaseId: confirmed.databaseId,
      pullRequestNumber: confirmed.number,
      pullRequestUrl: confirmed.url,
      branch: input.branch,
      headSha,
      reviewReplyIds: replies.ids,
      reconciled: reconciled || replies.reconciled,
    };
  }

  mergeDesign(input: Parameters<GitHubCapabilityAdapter["mergePlanning"]>[0]): Promise<GitHubPlanningMergeReceipt> {
    return this.mergePlanning(input);
  }

  async upsertTraceReviewCheck(input: {
    repository: string;
    headSha: string;
    externalId: string;
    detailsUrl: string;
    title: string;
    summary: string;
    conclusion: "success" | "neutral" | "failure";
  }): Promise<GitHubCheckRunReceipt> {
    const token = await this.tokens.token();
    const name = "DEOS OpenSpec traceability";
    const list = await this.json(
      token,
      `/repos/${input.repository}/commits/${input.headSha}/check-runs?check_name=${encodeURIComponent(name)}`,
    ) as { check_runs?: Array<{ id?: number; external_id?: string }> };
    if (!Array.isArray(list.check_runs)) throw new Error("GitHub Check Run list is invalid");
    const matches = list.check_runs.filter((check) => check.external_id === input.externalId);
    if (matches.length > 1) throw new Error("GitHub Check Run selection is ambiguous");
    const payload = {
      name,
      head_sha: input.headSha,
      external_id: input.externalId,
      details_url: input.detailsUrl,
      status: "completed",
      conclusion: input.conclusion,
      output: { title: input.title, summary: input.summary },
    };
    let id = matches[0]?.id;
    let reconciled = id !== undefined;
    try {
      const response = await this.json(
        token,
        id === undefined
          ? `/repos/${input.repository}/check-runs`
          : `/repos/${input.repository}/check-runs/${id}`,
        { method: id === undefined ? "POST" : "PATCH", body: payload },
      ) as { id?: number };
      if (typeof response.id !== "number") throw new Error("GitHub Check Run response is invalid");
      id = response.id;
    } catch {
      const after = await this.json(
        token,
        `/repos/${input.repository}/commits/${input.headSha}/check-runs?check_name=${encodeURIComponent(name)}`,
      ) as { check_runs?: Array<{ id?: number; external_id?: string }> };
      const recovered = after.check_runs?.filter((check) => check.external_id === input.externalId) ?? [];
      if (recovered.length !== 1 || typeof recovered[0]?.id !== "number") {
        throw new Error("GitHub Check Run write is ambiguous");
      }
      id = recovered[0].id;
      reconciled = true;
    }
    const confirmed = await this.json(
      token,
      `/repos/${input.repository}/check-runs/${id}`,
    ) as {
      id?: number;
      external_id?: string;
      head_sha?: string;
      details_url?: string;
      conclusion?: string;
      html_url?: string;
    };
    if (
      confirmed.id !== id || confirmed.external_id !== input.externalId ||
      confirmed.head_sha !== input.headSha || confirmed.details_url !== input.detailsUrl ||
      confirmed.conclusion !== input.conclusion || typeof confirmed.html_url !== "string"
    ) throw new Error("GitHub Check Run read-back mismatch");
    return { checkRunId: String(id), url: confirmed.html_url, reconciled };
  }

  async readReviewFeedback(repository: string, pullRequestNumber: number): Promise<readonly Record<string, unknown>[]> {
    const token = await this.tokens.token();
    const [reviews, reviewComments, issueComments] = await Promise.all([
      this.pagedList(token, `/repos/${repository}/pulls/${pullRequestNumber}/reviews`, 50, "review"),
      this.pagedList(token, `/repos/${repository}/pulls/${pullRequestNumber}/comments`, 100, "review-comment"),
      this.pagedList(token, `/repos/${repository}/issues/${pullRequestNumber}/comments`, 50, "issue-comment"),
    ]);
    const markerComments = reviewComments.filter((value) => {
      const entry = value as { body?: unknown; user?: { type?: unknown } };
      return entry.user?.type === "Bot" && typeof entry.body === "string" &&
        entry.body.includes("<!-- deos-review-reply:");
    });
    const actorLogin = markerComments.length === 0 ? null : await this.trustedActorLogin();
    const pick = (kind: string, entries: unknown[]): Record<string, unknown>[] => entries.map((value) => {
      const entry = value as Record<string, unknown>;
      const user = entry.user as Record<string, unknown> | undefined;
      return {
        kind,
        id: entry.id,
        body: typeof entry.body === "string" ? entry.body : "",
        state: entry.state,
        path: entry.path,
        line: entry.line,
        author: user?.login,
        authorType: user?.type,
        trustedAcknowledgmentAuthor: actorLogin !== null && user?.type === "Bot" &&
          typeof user.login === "string" && user.login.toLowerCase() === actorLogin.toLowerCase(),
        replyToId: typeof entry.in_reply_to_id === "number" ? entry.in_reply_to_id : null,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      };
    });
    return Object.freeze([
      ...pick("review", reviews),
      ...pick("review_comment", reviewComments),
      ...pick("issue_comment", issueComments),
    ]);
  }

  async mergePlanning(input: {
    repository: string;
    pullRequestNumber: number;
    pullRequestDatabaseId: string;
    baseBranch: "main";
    headBranch: string;
    expectedHeadSha: string;
  }): Promise<GitHubPlanningMergeReceipt> {
    const token = await this.tokens.token();
    const before = this.parsePull(await this.json(
      token,
      `/repos/${input.repository}/pulls/${input.pullRequestNumber}`,
    ));
    this.assertPlanningPullIdentity(before, input);
    if (before.merged) {
      if (before.mergeCommitSha === null) throw new Error("GitHub merged pull request has no merge commit");
      return {
        pullRequestDatabaseId: before.databaseId,
        pullRequestNumber: before.number,
        mergeCommitSha: before.mergeCommitSha,
        reconciled: true,
      };
    }
    if (before.state !== "open") throw new Error("GitHub planning pull request is closed without merge");
    let response: { merged?: boolean; sha?: string } | null = null;
    try {
      response = await this.json(token, `/repos/${input.repository}/pulls/${input.pullRequestNumber}/merge`, {
        method: "PUT",
        body: { sha: input.expectedHeadSha },
      }) as { merged?: boolean; sha?: string };
    } catch {
      // Read-back below distinguishes a committed merge from a rejected request.
    }
    const after = this.parsePull(await this.json(
      token,
      `/repos/${input.repository}/pulls/${input.pullRequestNumber}`,
    ));
    this.assertPlanningPullIdentity(after, input);
    if (!after.merged || after.mergeCommitSha === null) {
      throw new Error(response?.merged === false
        ? "GitHub planning merge was rejected"
        : "GitHub planning merge response is ambiguous");
    }
    if (typeof response?.sha === "string" && response.sha !== after.mergeCommitSha) {
      throw new Error("GitHub planning merge SHA mismatch");
    }
    return {
      pullRequestDatabaseId: after.databaseId,
      pullRequestNumber: after.number,
      mergeCommitSha: after.mergeCommitSha,
      reconciled: response?.merged !== true,
    };
  }

  async readFileAtRef(repository: string, path: string, ref: string): Promise<string> {
    const token = await this.tokens.token();
    const file = await this.readContent(token, repository, ref, path, false);
    if (file === null) throw new Error("GitHub planning file is missing");
    return file.content;
  }

  async readPullRequest(repository: string, pullRequestNumber: number): Promise<GitHubPlanningPullRequest> {
    const token = await this.tokens.token();
    return this.parsePull(await this.json(
      token,
      `/repos/${repository}/pulls/${pullRequestNumber}`,
    ));
  }

  async verifyCommitOnBranch(
    repository: string,
    commitSha: string,
    branch: string,
  ): Promise<GitHubCommitReachability> {
    const token = await this.tokens.token();
    const defaultHeadSha = await this.ref(token, repository, branch);
    if (defaultHeadSha === null) throw new Error("GitHub default branch is missing");
    const comparison = await this.json(
      token,
      `/repos/${repository}/compare/${encodeURIComponent(commitSha)}...${encodeURIComponent(defaultHeadSha)}`,
    ) as { status?: unknown; base_commit?: { sha?: unknown }; merge_base_commit?: { sha?: unknown } };
    if (
      typeof comparison.status !== "string" ||
      typeof comparison.base_commit?.sha !== "string" ||
      typeof comparison.merge_base_commit?.sha !== "string"
    ) throw new Error("GitHub commit reachability response is invalid");
    return {
      defaultHeadSha,
      reachable: comparison.base_commit.sha === commitSha &&
        comparison.merge_base_commit.sha === commitSha &&
        ["ahead", "identical"].includes(comparison.status),
    };
  }

  async readRepositoryGuidance(repository: string, ref: string): Promise<readonly GitHubGuidanceFile[]> {
    const token = await this.tokens.token();
    const tree = await this.json(
      token,
      `/repos/${repository}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    ) as { truncated?: unknown; tree?: Array<{ path?: unknown; type?: unknown; mode?: unknown }> };
    if (tree.truncated === true || !Array.isArray(tree.tree) || tree.tree.length > 100_000) {
      throw new Error("GitHub repository guidance tree is invalid or incomplete");
    }
    const allowed = (path: string): boolean =>
      path === "AGENTS.md" || path === "agents.md" || path === "architecture.md" ||
      /^architecture-[A-Za-z0-9_.-]+\.md$/.test(path) || path === "docs/current-architecture.md";
    const matches = tree.tree.filter((entry) => typeof entry.path === "string" && allowed(entry.path));
    if (matches.some((entry) => entry.type !== "blob" || !["100644", "100755"].includes(String(entry.mode)))) {
      throw new Error("GitHub repository guidance contains an unsafe file type");
    }
    const paths = matches.map((entry) => String(entry.path)).sort();
    if (new Set(paths).size !== paths.length || paths.length > 32) {
      throw new Error("GitHub repository guidance inventory is invalid");
    }
    const files = await Promise.all(paths.map(async (path) => ({
      path,
      content: (await this.readContent(token, repository, ref, path, false))!.content,
    })));
    const total = files.reduce((sum, file) => sum + new TextEncoder().encode(file.content).byteLength, 0);
    if (total > 64_000 || files.some((file) => file.content.includes("\u0000"))) {
      throw new Error("GitHub repository guidance exceeds the trusted text limit");
    }
    return Object.freeze(files.map((file) => Object.freeze(file)));
  }

  async readRef(repository: string, branch: string): Promise<string> {
    const value = await this.ref(await this.tokens.token(), repository, branch);
    if (value === null) throw new Error("GitHub ref is missing");
    return value;
  }

  private async assertDesignOnlyBranch(
    token: string,
    repository: string,
    baseCommit: string,
    headCommit: string,
    designPath: string,
    requireDesign: boolean,
  ): Promise<void> {
    const comparison = await this.json(
      token,
      `/repos/${repository}/compare/${encodeURIComponent(baseCommit)}...${encodeURIComponent(headCommit)}`,
    ) as {
      status?: unknown;
      base_commit?: { sha?: unknown };
      merge_base_commit?: { sha?: unknown };
      files?: Array<{ filename?: unknown }>;
    };
    if (
      !["ahead", "identical"].includes(String(comparison.status)) ||
      comparison.base_commit?.sha !== baseCommit || comparison.merge_base_commit?.sha !== baseCommit ||
      !Array.isArray(comparison.files)
    ) throw new Error("GitHub design branch comparison is invalid");
    const paths = comparison.files.map((file) => file.filename);
    if (paths.some((path) => typeof path !== "string") || new Set(paths).size !== paths.length) {
      throw new Error("GitHub design branch file inventory is invalid");
    }
    if (paths.some((path) => path !== designPath)) {
      throw new Error("GitHub design branch contains out-of-scope changes");
    }
    if (requireDesign && (paths.length !== 1 || paths[0] !== designPath)) {
      throw new Error("GitHub design branch does not contain the required design change");
    }
  }

  private async ref(
    token: string,
    repository: string,
    branch: string,
    allowNotFound = false,
  ): Promise<string | null> {
    const value = await this.json(
      token,
      `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
      undefined,
      allowNotFound,
    ) as { object?: { sha?: string } } | null;
    if (value === null) return null;
    const sha = value.object?.sha;
    if (typeof sha !== "string") throw new Error("GitHub ref response is invalid");
    return sha;
  }

  private async reviewComments(
    token: string,
    repository: string,
    pullRequestNumber: number,
  ): Promise<readonly GitHubReviewComment[]> {
    const value = await this.pagedList(
      token,
      `/repos/${repository}/pulls/${pullRequestNumber}/comments`,
      100,
      "review-comment",
    );
    return value.map((entry) => {
      const comment = entry as {
        id?: unknown;
        in_reply_to_id?: unknown;
        body?: unknown;
        user?: { type?: unknown; login?: unknown };
      };
      if (
        typeof comment.id !== "number" || !Number.isSafeInteger(comment.id) ||
        typeof comment.body !== "string" || typeof comment.user?.type !== "string" ||
        typeof comment.user.login !== "string" ||
        (comment.in_reply_to_id !== undefined && comment.in_reply_to_id !== null &&
          typeof comment.in_reply_to_id !== "number")
      ) throw new Error("GitHub review-comment response is invalid");
      return {
        id: comment.id,
        inReplyToId: typeof comment.in_reply_to_id === "number" ? comment.in_reply_to_id : null,
        body: comment.body,
        userType: comment.user.type,
        userLogin: comment.user.login,
      };
    });
  }

  private async pagedList(
    token: string,
    path: string,
    perPage: number,
    label: string,
  ): Promise<unknown[]> {
    const values: unknown[] = [];
    for (let page = 1; ; page += 1) {
      const suffix = page === 1 ? `?per_page=${perPage}` : `?per_page=${perPage}&page=${page}`;
      const batch = await this.json(token, `${path}${suffix}`);
      if (!Array.isArray(batch) || batch.length > perPage) {
        throw new Error(`GitHub ${label} list is invalid`);
      }
      values.push(...batch);
      if (batch.length < perPage) return values;
      if (values.length >= 10_000) throw new Error(`GitHub ${label} list exceeds the trusted limit`);
    }
  }

  private async replyToReviewThreads(
    token: string,
    repository: string,
    pullRequestNumber: number,
    requestedReplies: readonly { commentId: number; body: string }[],
    operationId: string,
  ): Promise<{ ids: readonly number[]; reconciled: boolean }> {
    let comments = await this.reviewComments(token, repository, pullRequestNumber);
    const roots = new Map(comments
      .filter((comment) => comment.inReplyToId === null && comment.userType === "User")
      .map((comment) => [comment.id, comment]));
    const requested = new Map(requestedReplies.map((reply) => [reply.commentId, reply]));
    if ([...requested.keys()].some((commentId) => !roots.has(commentId))) {
      throw new Error("GitHub review reply targets an unknown human review thread");
    }
    const marker = (commentId: number): string =>
      `<!-- deos-review-reply:${operationId}:${commentId} -->`;
    const actorLogin = roots.size === 0 ? null : await this.trustedActorLogin();
    const isAcknowledgment = (comment: GitHubReviewComment, rootId: number): boolean =>
      actorLogin !== null && comment.inReplyToId === rootId && comment.userType === "Bot" &&
      comment.userLogin.toLowerCase() === actorLogin.toLowerCase() &&
      comment.body.includes("<!-- deos-review-reply:") && comment.body.includes(`:${rootId} -->`);
    const outstanding = [...roots.keys()].filter((rootId) => {
      const thread = comments.filter((comment) => comment.id === rootId || comment.inReplyToId === rootId);
      const lastHumanId = Math.max(...thread
        .filter((comment) => comment.userType === "User")
        .map((comment) => comment.id));
      const lastAcknowledgmentId = Math.max(0, ...thread
        .filter((comment) => isAcknowledgment(comment, rootId))
        .map((comment) => comment.id));
      return lastAcknowledgmentId < lastHumanId;
    });
    if (outstanding.length > 50) throw new Error("GitHub outstanding review threads exceed the trusted limit");
    if (outstanding.some((commentId) => !requested.has(commentId))) {
      throw new Error("GitHub review reply manifest is incomplete");
    }

    const ids: number[] = [];
    let reconciled = requestedReplies.length > 0 && outstanding.length === 0;
    for (const reply of requestedReplies) {
      const existing = comments.find((comment) => isAcknowledgment(comment, reply.commentId));
      if (!outstanding.includes(reply.commentId)) {
        if (existing !== undefined) ids.push(existing.id);
        reconciled = true;
        continue;
      }
      const body = `${reply.body}\n\n${marker(reply.commentId)}`;
      try {
        const created = await this.json(
          token,
          `/repos/${repository}/pulls/${pullRequestNumber}/comments/${reply.commentId}/replies`,
          { method: "POST", body: { body } },
        ) as { id?: unknown; in_reply_to_id?: unknown; user?: { type?: unknown; login?: unknown } };
        if (
          typeof created.id !== "number" || created.in_reply_to_id !== reply.commentId ||
          created.user?.type !== "Bot" || typeof created.user.login !== "string" ||
          created.user.login.toLowerCase() !== actorLogin?.toLowerCase()
        ) {
          throw new Error("GitHub review reply response is invalid");
        }
        ids.push(created.id);
      } catch {
        comments = await this.reviewComments(token, repository, pullRequestNumber);
        const after = comments.find((comment) =>
          isAcknowledgment(comment, reply.commentId) && comment.body.includes(marker(reply.commentId)));
        if (after === undefined) throw new Error("GitHub review reply is ambiguous");
        ids.push(after.id);
        reconciled = true;
      }
    }
    return { ids: Object.freeze(ids), reconciled };
  }

  private encodedPath(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  private async trustedActorLogin(): Promise<string> {
    if (this.tokens.actorLogin === undefined) throw new Error("GitHub App actor identity is unavailable");
    const login = await this.tokens.actorLogin();
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?\[bot\]$/.test(login)) {
      throw new Error("GitHub App actor identity is invalid");
    }
    return login;
  }

  private async readContent(
    token: string,
    repository: string,
    ref: string,
    path: string,
    allowNotFound: boolean,
  ): Promise<{ sha: string; content: string } | null> {
    const value = await this.json(
      token,
      `/repos/${repository}/contents/${this.encodedPath(path)}?ref=${encodeURIComponent(ref)}`,
      undefined,
      allowNotFound,
    ) as { sha?: string; content?: string } | null;
    if (value === null) return null;
    if (typeof value.sha !== "string" || typeof value.content !== "string") {
      throw new Error("GitHub content response is invalid");
    }
    let content: string;
    try {
      const bytes = Uint8Array.from(
        atob(value.content.replace(/\s/g, "")),
        (character) => character.charCodeAt(0),
      );
      content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    } catch {
      throw new Error("GitHub content response is not valid UTF-8");
    }
    return { sha: value.sha, content };
  }

  private async writeContent(
    token: string,
    repository: string,
    branch: string,
    path: string,
    content: string,
    operationId: string,
    currentSha?: string,
  ): Promise<void> {
    const contentPath = `/repos/${repository}/contents/${this.encodedPath(path)}`;
    try {
      await this.json(token, contentPath, {
        method: "PUT",
        body: {
          message: `DEOS planning manifest ${operationId}`,
          content: base64(content),
          branch,
          ...(currentSha === undefined ? {} : { sha: currentSha }),
        },
      });
    } catch {
      const after = await this.readContent(token, repository, branch, path, true);
      if (after?.content !== content) throw new Error("GitHub planning file write is ambiguous");
    }
  }

  private parsePull(value: unknown): GitHubPlanningPullRequest {
    const pull = value as {
      id?: unknown;
      number?: unknown;
      html_url?: unknown;
      state?: unknown;
      draft?: unknown;
      merged?: unknown;
      merge_commit_sha?: unknown;
      head?: { ref?: unknown; sha?: unknown };
      base?: { ref?: unknown };
    };
    if (
      typeof pull.id !== "number" ||
      typeof pull.number !== "number" ||
      typeof pull.html_url !== "string" ||
      typeof pull.state !== "string" ||
      typeof pull.draft !== "boolean" ||
      typeof pull.merged !== "boolean" ||
      typeof pull.head?.ref !== "string" ||
      typeof pull.head.sha !== "string" ||
      typeof pull.base?.ref !== "string"
    ) throw new Error("GitHub planning pull-request response is invalid");
    return {
      databaseId: String(pull.id),
      number: pull.number,
      url: pull.html_url,
      state: pull.state,
      draft: pull.draft,
      merged: pull.merged,
      mergeCommitSha: typeof pull.merge_commit_sha === "string" ? pull.merge_commit_sha : null,
      headBranch: pull.head.ref,
      headSha: pull.head.sha,
      baseBranch: pull.base.ref,
    };
  }

  private assertPlanningPullIdentity(
    pull: GitHubPlanningPullRequest,
    expected: {
      pullRequestNumber: number;
      pullRequestDatabaseId: string;
      baseBranch: "main";
      headBranch: string;
      expectedHeadSha: string;
    },
  ): void {
    if (
      pull.number !== expected.pullRequestNumber ||
      pull.databaseId !== expected.pullRequestDatabaseId ||
      pull.baseBranch !== expected.baseBranch ||
      pull.headBranch !== expected.headBranch ||
      pull.headSha !== expected.expectedHeadSha
    ) throw new Error("GitHub planning pull-request identity mismatch");
  }

  private async json(
    token: string,
    path: string,
    options?: { method: "DELETE" | "PATCH" | "POST" | "PUT"; body: Record<string, unknown> },
    allowNotFound = false,
  ): Promise<unknown> {
    const response = await this.request(`${this.apiUrl}${path}`, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "deos-orchestrator",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(options === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw new Error("GitHub provider request failed");
    return response.json();
  }
}
