export type PortalPage = "workflow" | "settings" | "review" | "not-found";

export const portalPageFromPath = (pathname: string): PortalPage => {
  if (pathname === "/") return "workflow";
  if (pathname === "/settings" || pathname === "/settings/") return "settings";
  if (/^\/runs\/.+\/review\/?$/.test(pathname)) return "review";
  return "not-found";
};

export const portalPathForPage = (page: Exclude<PortalPage, "not-found" | "review">): string =>
  page === "settings" ? "/settings" : "/";

export const reviewRunIdFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/runs\/(.+)\/review\/?$/);
  if (match === null) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};
