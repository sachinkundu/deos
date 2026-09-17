import type { ImplementationDemoView } from './implementation-demo-view.ts';

export function ImplementationDemo({ kind, demo, expanded, runId }: {
  kind: 'plan' | 'gate'; demo: ImplementationDemoView | null | undefined; expanded: boolean; runId: string;
}) {
  const review = demo?.[kind];
  const scenarios = demo?.plan?.value.scenarios ?? [];
  const gate = kind === 'gate' ? demo?.gate : null;
  const done = gate?.value.scenarios.filter(item => item.outcome === 'pass').length ?? 0;
  const proofUrl = (id: string) => `/api/implementation/${encodeURIComponent(runId)}/proof/${encodeURIComponent(id)}`;
  return <div className="implementation-demo">
    <span className="demo-author">Claude · Independent {kind === 'plan' ? 'demo plan' : 'demo review'}</span>
    {review && <>
      {gate?.repairComplete ? <p className="demo-previous">Sol’s response is complete. These findings and changes await your review.</p>
        : !review.current && <p className="demo-previous">Previous assessment</p>}
      <p className={expanded ? "demo-summary" : "demo-summary is-collapsed"}>{review.value.summary}</p>
      <span className="demo-count">{kind === 'plan' ? `${scenarios.length} demo scenarios` : `${done} of ${scenarios.length} scenarios demonstrated`}</span>
      {expanded && <ul className="demo-scenarios">{scenarios.map(scenario => {
        const result = gate?.value.scenarios.find(item => item.id === scenario.id);
        const label = result ? {pass: 'Demonstrated', needs_work: 'Needs work', blocked: 'Blocked'}[result.outcome] : 'Required';
        return <li key={scenario.id}>
          <div className="demo-scenario-title"><span aria-hidden="true">{result?.outcome === 'pass' ? '☑' : '☐'}</span><strong>{scenario.title}</strong><span>{label}</span></div>
          <p>{result?.reason ?? scenario.expected}</p>
          {demo?.plan?.value.corrections?.filter(item => item.scenarioId === scenario.id).map(item =>
            <p className="demo-previous" key={item.scenarioId}>Plan corrected: {item.reason}</p>)}
          <details><summary>Demo requirements</summary><p>{scenario.environment}</p><ol>{scenario.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
            <p>{scenario.expected}</p><p className="demo-source">Approved requirements: {scenario.requirementIds.map(id => id.replace(/^approved\//, '')).join(', ')}</p></details>
          {result && result.evidenceIds.length > 0 && <div className="demo-evidence">{result.evidenceIds.map((id, index) => <a key={id} href={proofUrl(id)} target="_blank" rel="noreferrer">View evidence {index + 1}</a>)}</div>}
        </li>;
      })}</ul>}
    </>}
  </div>;
}
