export type PortalPage = "workflow" | "settings" | "not-found";

export const portalPageFromPath = (pathname: string): PortalPage => {
  if (pathname === "/") return "workflow";
  if (pathname === "/settings" || pathname === "/settings/") return "settings";
  return "not-found";
};

export const portalPathForPage = (page: Exclude<PortalPage, "not-found">): string =>
  page === "settings" ? "/settings" : "/";
