const PORTAL_VIEWS = new Set(["pr", "review"]);

export function selectPortalView(view) {
  if (!PORTAL_VIEWS.has(view)) throw new Error(`Unknown portal view: ${view}`);
  return { activeView: view, activeQualityPath: null };
}
