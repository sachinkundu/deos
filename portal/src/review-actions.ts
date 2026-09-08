export interface PullRequestAction {
  kind: "github" | "bettaview";
  label: string;
  url: string;
}

export const bettaViewUrl = (pullRequestUrl: string): string =>
  `https://bettaview.voxdez.com/?pr=${encodeURIComponent(pullRequestUrl)}`;

export const pullRequestActions = (
  pullRequestUrl: string,
  githubLabel: string,
): readonly PullRequestAction[] => Object.freeze([
  Object.freeze({ kind: "bettaview", label: "Open in BettaView", url: bettaViewUrl(pullRequestUrl) }),
]);

export const reviewDestination = (url: string): string =>
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+(?:[/?#]|$)/.test(url) ? bettaViewUrl(url) : url;
