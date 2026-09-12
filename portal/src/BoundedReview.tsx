import { useEffect, useState } from 'react';
import { errorText } from '../../src/error-details.ts';
interface Source { id: string; title: string; url: string; provenance: string }
interface Cycle {
 phase: string;
 discovery: {status: string;invocations: {id:string;status:string}[];result?:{sources:Source[]}};
 recheck: {status: string;invocations: {id:string;status:string}[];result?:{sources:Source[]}};
 repair:{started:boolean;outcome:string|null};
 findings:{id:string;summary:string;location:string}[];
 openIds:string[];
 reviewedHead:string|null;
 currentHead:string|null;
 capabilities?:{webSearch:string;skills:{id:string;sha256:string}[]};
}
export function BoundedReview({runId,phase,load,onTranscript}:{runId:string;phase:string;load:<T>(path:string,signal?:AbortSignal)=>Promise<T>;onTranscript:(id:string)=>void}){
 const [cycle,setCycle]=useState<Cycle|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  setCycle(null);setError('');
  void load<{cycles:Cycle[]}>(`/api/runs/${encodeURIComponent(runId)}/review-cycles`,controller.signal)
   .then(value=>setCycle(value.cycles.find(item=>item.phase===phase)??null))
   .catch(error=>{if(!controller.signal.aborted)setError(errorText(error));});
  return()=>controller.abort();
 },[runId,phase,load]);
 if(error)return <p role="alert">{error}</p>;
 if(!cycle)return <p>Self-review evidence will appear after this author attempt finishes.</p>;
 const sources=[...(cycle.discovery.result?.sources??[]),...(cycle.recheck.result?.sources??[])];
 return <section className="bounded-review" aria-label="Self-review within the first author attempt">
  <h4>First draft self-review</h4>
  <dl><div><dt>Discovery</dt><dd>{cycle.discovery.status}</dd></div><div><dt>Author repair</dt><dd>{cycle.repair.started?(cycle.repair.outcome??'Started'): 'Not needed'}</dd></div><div><dt>Closed recheck</dt><dd>{cycle.recheck.status}</dd></div></dl>
  {cycle.recheck.status==='unavailable'&&<p role="status">The recheck was unavailable. All original findings remain open for human judgment.</p>}
  {cycle.findings.length?<ul>{cycle.findings.map(finding=><li key={finding.id}><strong>{cycle.openIds.includes(finding.id)?'Open':'Fixed'}: {finding.id}</strong><p>{finding.summary}</p><code>{finding.location}</code></li>)}</ul>:<p>No self-review findings.</p>}
  {[...cycle.discovery.invocations,...cycle.recheck.invocations].filter(item=>item.status==='accepted').map((item,index)=><button type="button" key={item.id} onClick={()=>onTranscript(`child:${item.id}`)}>View {index===0?'discovery':'recheck'} transcript</button>)}
  {sources.length>0&&<ul>{sources.map((source,index)=><li key={`${source.id}:${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer nofollow">{source.title}</a> · {source.provenance}</li>)}</ul>}
  {cycle.reviewedHead&&<p>Reviewed head: <code>{cycle.reviewedHead}</code>. Current head: <code>{cycle.currentHead}</code>.</p>}
  {cycle.reviewedHead&&cycle.currentHead!==cycle.reviewedHead&&<p>Past review does not cover the current head. No new semantic review was due for later edits.</p>}
  {cycle.capabilities&&<details><summary>Tools and skills supplied</summary><p>Web search: {cycle.capabilities.webSearch}</p><ul>{cycle.capabilities.skills.map(skill=><li key={skill.id}>{skill.id} · <code>{skill.sha256}</code></li>)}</ul></details>}
 </section>;
}
