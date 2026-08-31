import type { GitHubTokenProvider } from "./github-capability.ts";

export type GitUploadPackRequest = "advertisement" | "upload_pack";

export interface GitHubGitProxyAdapter {
  proxy(input: {
    request: Request;
    repository: string;
    installationId: string;
    kind: GitUploadPackRequest;
  }): Promise<Response>;
}

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export class GitHubGitProxy implements GitHubGitProxyAdapter {
  private readonly tokenProvider: (installationId: string) => GitHubTokenProvider;
  private readonly request: typeof fetch;

  constructor(input: {
    tokenProvider: (installationId: string) => GitHubTokenProvider;
    fetch?: typeof fetch;
  }) {
    this.tokenProvider = input.tokenProvider;
    this.request = input.fetch ?? ((request, init) => fetch(request, init));
  }

  async proxy(input: {
    request: Request;
    repository: string;
    installationId: string;
    kind: GitUploadPackRequest;
  }): Promise<Response> {
    const [owner, name] = input.repository.split("/");
    if (
      !repositoryPattern.test(input.repository) ||
      owner === "." || owner === ".." || name === "." || name === ".." ||
      !/^[1-9][0-9]{0,19}$/.test(input.installationId)
    ) return new Response("repository checkout target is invalid\n", { status: 400 });

    const token = await this.tokenProvider(input.installationId).token();
    const authorization = btoa(`x-access-token:${token}`);
    const headers = new Headers({
      Authorization: `Basic ${authorization}`,
      Accept: input.kind === "advertisement"
        ? "application/x-git-upload-pack-advertisement"
        : "application/x-git-upload-pack-result",
      "User-Agent": "deos-orchestrator",
    });
    const protocol = input.request.headers.get("Git-Protocol");
    if (protocol !== null && protocol.length <= 100) headers.set("Git-Protocol", protocol);
    if (input.kind === "upload_pack") {
      headers.set("Content-Type", "application/x-git-upload-pack-request");
    }
    const suffix = input.kind === "advertisement"
      ? "/info/refs?service=git-upload-pack"
      : "/git-upload-pack";
    const repositoryPath = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const response = await this.request(`https://github.com/${repositoryPath}.git${suffix}`, {
      method: input.kind === "advertisement" ? "GET" : "POST",
      headers,
      body: input.kind === "upload_pack" ? input.request.body : null,
      redirect: "manual",
    });
    if (!response.ok) {
      return new Response("repository checkout upstream failed\n", {
        status: response.status === 401 || response.status === 403 ? 403 : 502,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(response.body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": response.headers.get("Content-Type") ??
          (input.kind === "advertisement"
            ? "application/x-git-upload-pack-advertisement"
            : "application/x-git-upload-pack-result"),
      },
    });
  }
}
