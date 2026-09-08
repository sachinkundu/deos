export interface PullRequestAction {
  kind: "github" | "bettaview";
  label: string;
  url: string;
}

export const bettaViewUrl = (pullRequestUrl: string): string =>
  `https://bettaview.voxdez.com/?pr=${encodeURIComponent(pullRequestUrl)}`;

export const bettaViewLabel = (url: string): string => {
  const number = new URL(url).pathname.match(/\/pull\/(\d+)/)?.[1];
  return number ? `BettaView PR#${number}` : "BettaView";
};

export const pullRequestActions = (
  pullRequestUrl: string,
  githubLabel: string,
): readonly PullRequestAction[] => Object.freeze([
  Object.freeze({ kind: "bettaview", label: bettaViewLabel(pullRequestUrl), url: bettaViewUrl(pullRequestUrl) }),
]);

export const reviewDestination = (url: string): string =>
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+(?:[/?#]|$)/.test(url) ? bettaViewUrl(url) : url;
