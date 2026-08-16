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

export interface GitHubTokenProvider {
  token(): Promise<string>;
}

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
    const jwt = await this.jwt();
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

  private async jwt(): Promise<string> {
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
      html_url?: string;
      body?: string;
    }>;
    let pull = pulls.find((candidate) => candidate.body?.includes(marker));
    if (pull === undefined) {
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

  private async json(
    token: string,
    path: string,
    options?: { method: "POST" | "PUT"; body: Record<string, unknown> },
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
