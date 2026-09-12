import { useEffect, useState } from 'react';
import { errorText } from '../../src/error-details.ts';
interface Sources {
    sources: Source[];
    searchDisposition: string;
}
interface Source {
    id: string;
    title: string;
    url: string;
    provenance: string;
}
interface Cycle {
    phase: string;
    authorSources?: Sources;
    independent: {
        attemptId?: string;
        result: {
            findings: {
                id: string;
                summary: string;
                location: string;
            }[];
            sourceEvidence: Sources[];
        } | null;
    };
    response: {
        result: {
            id: string;
            disposition: string;
            response: string;
        }[] | null;
    };
    discovery: {
        status: string;
        invocations: {
            id: string;
            status: string;
        }[];
        result?: Sources;
    };
    recheck: {
        status: string;
        invocations: {
            id: string;
            status: string;
        }[];
        result?: Sources;
    };
    repair: {
        started: boolean;
        outcome: string | null;
    };
    findings: {
        id: string;
        summary: string;
        location: string;
    }[];
    openIds: string[];
    reviewedHead: string | null;
    currentHead: string | null;
    capabilities?: {
        webSearch: string;
        skills: {
            id: string;
            sha256: string;
        }[];
    };
}
export function BoundedReview({ runId, phase, load, onTranscript }: {
    runId: string;
    phase: string;
    load: <T>(path: string, signal?: AbortSignal) => Promise<T>;
    onTranscript: (id: string) => void;
}) {
    const [cycle, setCycle] = useState<Cycle | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        setCycle(null);
        setError('');
        void load<{
            cycles: Cycle[];
        }>(`/api/runs/${encodeURIComponent(runId)}/review-cycles`, controller.signal)
            .then(value => setCycle(value.cycles.find(item => item.phase === phase) ?? null))
            .catch(error => { if (!controller.signal.aborted)
            setError(errorText(error)); });
        return () => controller.abort();
    }, [runId, phase, load]);
    if (error)
        return <p role="alert">{error}</p>;
    if (!cycle)
        return <p>Self-review evidence will appear after this author attempt finishes.</p>;
    const evidence = [['Author', cycle.authorSources], ['Discovery', cycle.discovery.result], ['Recheck', cycle.recheck.result]] as const;
    return <section className="bounded-review" aria-label="Self-review within the first author attempt">
  <h4>First draft self-review</h4>
  <dl><div><dt>Discovery</dt><dd>{cycle.discovery.status}</dd></div><div><dt>Author repair</dt><dd>{cycle.repair.started ? (cycle.repair.outcome ?? 'Started') : 'Not needed'}</dd></div><div><dt>Closed recheck</dt><dd>{cycle.recheck.status}</dd></div></dl>
  {cycle.recheck.status === 'unavailable' && <p role="status">The recheck was unavailable. All original findings remain open for human judgment.</p>}
  {cycle.findings.length ? <ul>{cycle.findings.map(finding => <li key={finding.id}><strong>{cycle.openIds.includes(finding.id) ? 'Open' : 'Fixed'}: {finding.id}</strong><p>{finding.summary}</p><code>{finding.location}</code></li>)}</ul> : <p>{cycle.discovery.status === 'accepted' ? 'No self-review findings.' : 'Discovery has not returned a valid result.'}</p>}
  {(['discovery', 'recheck'] as const).map(slot => cycle[slot].invocations.map((item, index) => <div key={item.id}><button className="agent-transcript-button" type="button" onClick={() => onTranscript(`child:${item.id}`)}>View {slot} transcript {index + 1}</button> · {item.status}</div>))}
  {evidence.map(([label, sources]) => sources && <SourceList key={label} label={label} evidence={sources}/>)}
  {cycle.independent.result && <details><summary>Independent findings and author responses</summary>
   {cycle.independent.attemptId && <button className="agent-transcript-button" type="button" onClick={() => onTranscript(cycle.independent.attemptId!)}>View independent transcript</button>}
   {cycle.independent.result.findings.length ? <ul>{cycle.independent.result.findings.map(finding => {
                    const response = cycle.response.result?.find(item => item.id === finding.id);
                    return <li key={finding.id}><strong>{finding.id}</strong><p>{finding.summary}</p><code>{finding.location}</code><p>{response ? `${response.disposition.replaceAll('_', ' ')}: ${response.response}` : 'Author response pending.'}</p></li>;
                })}</ul> : <p>No independent concerns.</p>}
   {cycle.independent.result.sourceEvidence.map((sources, index) => <SourceList key={index} label={`Independent ${index + 1}`} evidence={sources}/>)}
  </details>}
  {cycle.reviewedHead && <p>Reviewed head: <code>{cycle.reviewedHead}</code>. Current head: <code>{cycle.currentHead}</code>.</p>}
  {cycle.reviewedHead && cycle.currentHead !== cycle.reviewedHead && <p>Past review does not cover the current head. No new semantic review was due for later edits.</p>}
  {cycle.capabilities && <details><summary>Tools and skills supplied</summary><p>Web search: {cycle.capabilities.webSearch}</p><ul>{cycle.capabilities.skills.map(skill => <li key={skill.id}>{skill.id} · <code>{skill.sha256}</code></li>)}</ul></details>}
 </section>;
}
function SourceList({ label, evidence }: {
    label: string;
    evidence: Sources;
}) {
    return <details><summary>{label} sources: {evidence.searchDisposition.replaceAll('_', ' ')}</summary>
  {evidence.sources.length > 0 && <ul>{evidence.sources.map((source, index) => <li key={`${source.id}:${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer nofollow">{source.title}</a> · {source.provenance ?? 'declared'}</li>)}</ul>}
 </details>;
}
