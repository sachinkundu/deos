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

interface GitHubReviewComment {
  id: number;
  inReplyToId: number | null;
  body: string;
  userType: string;
}

export interface GitHubPlanningMergeReceipt {
  pullRequestDatabaseId: string;
  pullRequestNumber: number;
  mergeCommitSha: string;
  reconciled: boolean;
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

  async readReviewFeedback(repository: string, pullRequestNumber: number): Promise<readonly Record<string, unknown>[]> {
    const token = await this.tokens.token();
    const [reviews, reviewComments, issueComments] = await Promise.all([
      this.json(token, `/repos/${repository}/pulls/${pullRequestNumber}/reviews?per_page=50`),
      this.json(token, `/repos/${repository}/pulls/${pullRequestNumber}/comments?per_page=100`),
      this.json(token, `/repos/${repository}/issues/${pullRequestNumber}/comments?per_page=50`),
    ]) as [unknown[], unknown[], unknown[]];
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

  async readPlanningPullRequest(
    repository: string,
    pullRequestNumber: number,
  ): Promise<GitHubPlanningPullRequest> {
    const token = await this.tokens.token();
    return this.parsePull(await this.json(token, `/repos/${repository}/pulls/${pullRequestNumber}`));
  }

  async readFileAtRef(repository: string, path: string, ref: string): Promise<string> {
    const token = await this.tokens.token();
    const file = await this.readContent(token, repository, ref, path, false);
    if (file === null) throw new Error("GitHub planning file is missing");
    return file.content;
  }

  async readRef(repository: string, branch: string): Promise<string> {
    const value = await this.ref(await this.tokens.token(), repository, branch);
    if (value === null) throw new Error("GitHub ref is missing");
    return value;
  }

  async commitIsOnBranch(repository: string, commitSha: string, branch: string): Promise<boolean> {
    const token = await this.tokens.token();
    const headSha = await this.ref(token, repository, branch);
    if (headSha === null) return false;
    if (headSha === commitSha) return true;
    const comparison = await this.json(
      token,
      `/repos/${repository}/compare/${encodeURIComponent(commitSha)}...${encodeURIComponent(headSha)}`,
    ) as { status?: unknown };
    return comparison.status === "ahead" || comparison.status === "identical";
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
    const value = await this.json(
      token,
      `/repos/${repository}/pulls/${pullRequestNumber}/comments?per_page=100`,
    );
    if (!Array.isArray(value) || value.length >= 100) {
      throw new Error("GitHub review-comment list is invalid or incomplete");
    }
    return value.map((entry) => {
      const comment = entry as {
        id?: unknown;
        in_reply_to_id?: unknown;
        body?: unknown;
        user?: { type?: unknown };
      };
      if (
        typeof comment.id !== "number" || !Number.isSafeInteger(comment.id) ||
        typeof comment.body !== "string" || typeof comment.user?.type !== "string" ||
        (comment.in_reply_to_id !== undefined && comment.in_reply_to_id !== null &&
          typeof comment.in_reply_to_id !== "number")
      ) throw new Error("GitHub review-comment response is invalid");
      return {
        id: comment.id,
        inReplyToId: typeof comment.in_reply_to_id === "number" ? comment.in_reply_to_id : null,
        body: comment.body,
        userType: comment.user.type,
      };
    });
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
    const isAcknowledgment = (comment: GitHubReviewComment, rootId: number): boolean =>
      comment.inReplyToId === rootId && comment.userType === "Bot" &&
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
        ) as { id?: unknown; in_reply_to_id?: unknown };
        if (typeof created.id !== "number" || created.in_reply_to_id !== reply.commentId) {
          throw new Error("GitHub review reply response is invalid");
        }
        ids.push(created.id);
      } catch {
        comments = await this.reviewComments(token, repository, pullRequestNumber);
        const after = comments.find((comment) =>
          comment.inReplyToId === reply.commentId && comment.body.includes(marker(reply.commentId)));
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
    return {
      sha: value.sha,
      content: new TextDecoder().decode(
        Uint8Array.from(atob(value.content.replace(/\s/g, "")), (character) => character.charCodeAt(0)),
      ),
    };
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
