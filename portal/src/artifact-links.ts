export interface StageArtifact { label: string; url: string }
interface ArtifactProduct {
  repository: string;
  change_id: string;
  head_sha: string | null;
  merge_commit_sha: string | null;
  planning_manifest_json?: string | null;
}
export function stageArtifactLinks(product: ArtifactProduct, kind: "planning" | "design"): StageArtifact[] {
  const ref = product.merge_commit_sha ? "main" : product.head_sha;
  if (!ref) return [];
  const prefix = `openspec/changes/${product.change_id}/`;
  const paths: string[] = kind === "design" ? [`${prefix}design.md`] :
    (JSON.parse(product.planning_manifest_json ?? "[]") as Array<{path: string}>).map(entry => entry.path)
      .filter(path => path === `${prefix}proposal.md` || (path.startsWith(`${prefix}specs/`) && path.endsWith("/spec.md")));
  return paths.map(path => ({
    label: path.endsWith("/proposal.md") ? "Proposal" : kind === "design" ? "design.md" : `Spec: ${path.slice(prefix.length + 6, -8)}`,
    url: `https://github.com/${product.repository}/blob/${ref}/${path.split("/").map(encodeURIComponent).join("/")}`,
  }));
}
