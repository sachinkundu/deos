import { useEffect, useState } from "react";
interface ImplementationView {
  status: string;
  branch: string;
  prUrl: string | null;
  approvedDesignSha: string;
  testedBaseSha: string;
  treeSha: string | null;
  mergeSha: string | null;
  tasks: string | null;
  checks: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }[];
  assumptions: string[];
  attempts: {
    attempt_id: string;
    try_sequence: number;
    kind: string;
    status: string;
    tested_base_sha: string;
  }[];
  proof: {
    proof_id: string;
    kind: string;
    caption: string;
    tree_sha: string;
    tested_base_sha: string;
  }[];
  gates: {
    expected_event_kind: string;
    state: string;
    head_sha: string | null;
    base_sha: string | null;
  }[];
  question: { question: string; reason: string; status: string } | null;
  documentation: {
    url: string;
    title: string;
    claim: string;
    artifact_locator: string;
  }[];
  errors: { error_id: string; operation: string; created_at: string }[];
}
export function Implementation({
  runId,
  freshness,
}: {
  runId: string;
  freshness: string;
}) {
  const [data, setData] = useState<ImplementationView | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    void fetch(`/api/implementation/${encodeURIComponent(runId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Implementation view HTTP ${response.status}`);
        return response.json();
      })
      .then((value) => setData(value as ImplementationView | null))
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      });
    return () => controller.abort();
  }, [runId, freshness]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return null;
  const proofUrl = (id: string) =>
    `/api/implementation/${encodeURIComponent(runId)}/proof/${encodeURIComponent(id)}`;
  return (
    <section className="workflow-panel implementation-panel">
      <h2>Implementation</h2>
      <p>
        {data.mergeSha
          ? "Code merged. Live release has not begun."
          : data.status === "stale"
            ? "The base changed. Checks and proof must be renewed."
            : data.gates[0]?.state === "open"
              ? data.gates[0].expected_event_kind === "comment"
                ? "Waiting for your answer in Linear."
                : "Ready for human review in Linear."
              : "Implementation is in progress."}
      </p>
      <p>
        <code>{data.branch}</code>
        {data.prUrl && (
          <>
            {" "}
            ·{" "}
            <a href={data.prUrl} target="_blank" rel="noreferrer">
              Implementation PR
            </a>
          </>
        )}
      </p>
      {data.question && data.question.status !== "closed" && (
        <aside className="guard-note">
          <strong>{data.question.question}</strong>
          <p>{data.question.reason}</p>
          <p>
            {data.question.status === "answered"
              ? "Answer received. A fresh try uses the reply."
              : "Reply to the question in Linear to continue."}
          </p>
        </aside>
      )}
      <details>
        <summary>Approved and tested revisions</summary>
        <dl>
          <dt>Approved design</dt>
          <dd>
            <code>{data.approvedDesignSha}</code>
          </dd>
          <dt>Tested base</dt>
          <dd>
            <code>{data.testedBaseSha}</code>
          </dd>
          <dt>Checked tree</dt>
          <dd>
            <code>{data.treeSha}</code>
          </dd>
        </dl>
      </details>
      {data.tasks && (
        <details open>
          <summary>Tasks</summary>
          <pre>{data.tasks}</pre>
        </details>
      )}
      <h3>Checks</h3>
      {data.checks.map((check, index) => (
        <details key={index}>
          <summary>
            {check.exitCode === 0 ? "Passed" : "Failed"}: {check.command}
          </summary>
          <pre>
            {check.stdout}
            {check.stderr}
          </pre>
        </details>
      ))}
      <h3>Behavior proof</h3>
      <div className="implementation-gallery">
        {data.proof.map((proof) => (
          <figure key={proof.proof_id}>
            {proof.kind === "browser_image" ? (
              <a
                href={proofUrl(proof.proof_id)}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={proofUrl(proof.proof_id)}
                  alt={proof.caption}
                  loading="lazy"
                />
              </a>
            ) : (
              <a
                href={proofUrl(proof.proof_id)}
                target="_blank"
                rel="noreferrer"
              >
                {proof.kind.replaceAll("_", " ")}
              </a>
            )}
            <figcaption>
              {proof.caption}
              {(proof.tree_sha !== data.treeSha ||
                proof.tested_base_sha !== data.testedBaseSha) && (
                <strong> · Earlier revision</strong>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      <details>
        <summary>Attempts ({data.attempts.length})</summary>
        <ul>
          {data.attempts.map((attempt) => (
            <li key={attempt.attempt_id}>
              Try {attempt.try_sequence}: {attempt.kind} ·{" "}
              {attempt.status.replaceAll("_", " ")} · base{" "}
              {attempt.tested_base_sha.slice(0, 8)}
            </li>
          ))}
        </ul>
      </details>
      {data.assumptions.length > 0 && (
        <>
          <h3>Assumptions</h3>
          <ul>
            {data.assumptions.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </>
      )}
      {data.documentation.length > 0 && (
        <>
          <h3>Documentation</h3>
          <ul>
            {data.documentation.map((source, i) => (
              <li key={i}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                : {source.claim} · {source.artifact_locator}
              </li>
            ))}
          </ul>
        </>
      )}
      {data.errors.length > 0 && (
        <details>
          <summary>Preserved errors ({data.errors.length})</summary>
          <ul>
            {data.errors.map((error) => (
              <li key={error.error_id}>
                <a
                  href={`/api/implementation/${encodeURIComponent(runId)}/error/${encodeURIComponent(error.error_id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {error.operation}
                </a>{" "}
                · {error.created_at}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
