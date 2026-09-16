import assert from "node:assert/strict";
import test from "node:test";
import { ImplementationService } from "../src/implementation-service.ts";
import { ImplementationStore } from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";
import {
  D1OrchestrationStore,
  type WorkflowInboxRecord,
} from "../src/orchestration-store.ts";
import type {
  LoadedWorkflowDefinition,
  HumanGateWorkflowNode,
} from "../src/workflow-definition.ts";
import {
  ImplementationTestDatabase,
  ImplementationTestBucket,
  seedRun,
} from "./helpers/implementation-fixture.ts";
const opened = "2026-09-14T01:00:00Z",
  replied = "2026-09-14T02:00:00Z";
async function setup(kind: "comment" | "state") {
  const db = new ImplementationTestDatabase(),
    bucket = new ImplementationTestBucket();
  seedRun(db);
  const env = {
    DB: db,
    ARTIFACTS: bucket,
    LINEAR_API_URL: "https://linear.test/graphql",
    LINEAR_APP_ACCESS_TOKEN: "test",
  } as unknown as Env;
  const store = new ImplementationStore(env.DB, env.ARTIFACTS);
  await store.allocate(
    {
      version: 1,
      runId: "run-1",
      repository: "owner/repo",
      change: "sample",
      branch: "deos/agent/SAC-172/run-1",
      approvedDesignSha: "a".repeat(40),
      testedBaseSha: "b".repeat(40),
      policy: implementationPolicy,
      approvedFiles: [],
      issue: {},
      receipts: {},
      requirements: { kinds: [], reasons: [], blockedProviders: [] },
    },
    { userId: "human", revision: 1 },
    "SAC-172",
    1,
  );
  const object = await store.put(
    "run-1",
    "question.json",
    JSON.stringify({
      blockKey: "choice",
      question: "Which option?",
      reason: "Required choice",
    }),
  );
  db.sqlite
    .prepare(
      `INSERT INTO implementation_questions(question_id,run_id,block_key,gate_visit,opened_delivery_id,opened_at,question_key,question_sha,status,linear_comment_id)
 VALUES ('question','run-1','choice',1,'opening',?,?,?,'open','question-comment')`,
    )
    .run(opened, object.key, object.sha256);
  db.sqlite
    .prepare(
      `INSERT INTO implementation_gates(run_id,visit_sequence,node_id,expected_event_kind,allowed_linear_user_id,issue_id,human_state_id,question_id,opened_at)
 VALUES ('run-1',1,'implementation_review',?,'human','issue-1','review','question',?)`,
    )
    .run(kind, opened);
  const node: HumanGateWorkflowNode = {
    id: "implementation_review",
    type: "human_gate",
    linearState: "Human Review",
    expectedEventKind: kind,
    decisions:
      kind === "comment"
        ? { reply_received: "In Progress" }
        : {
            merge_authorized: "Merging",
            revision_requested: "In Progress",
            canceled: "Canceled",
          },
    edges:
      kind === "comment"
        ? { reply_received: "implementation_build" }
        : {
            merge_authorized: "merge",
            revision_requested: "implementation_build",
            canceled: "canceled",
          },
  };
  const definition = {
    nodes: { implementation_review: node },
  } as unknown as LoadedWorkflowDefinition;
  const authority = new D1OrchestrationStore(env.DB);
  const run = (await authority.findRun("run-1"))!;
  let n = 0;
  const event = async (overrides: Partial<WorkflowInboxRecord> = {}) => {
    const e: WorkflowInboxRecord = {
      delivery_id: `event-${++n}`,
      run_id: "run-1",
      correlation_id: "run-1",
      event_kind: "Comment.create",
      actor_id: "human",
      actor_type: "user",
      provider_time: replied,
      from_state_id: null,
      from_state_name: null,
      to_state_id: "review",
      to_state_name: "Human Review",
      payload_digest: "d".repeat(64),
      state: "claimed",
      comment_id: "reply",
      ...overrides,
    };
    await authority.insertInboxEvent(
      {
        deliveryId: e.delivery_id,
        runId: e.run_id,
        correlationId: e.correlation_id,
        eventKind: e.event_kind,
        actorId: e.actor_id,
        actorType: e.actor_type,
        providerTime: e.provider_time,
        fromStateId: e.from_state_id,
        fromStateName: e.from_state_name,
        toStateId: e.to_state_id,
        toStateName: e.to_state_name,
        payloadDigest: e.payload_digest,
        commentId: e.comment_id,
      },
      replied,
    );
    return e;
  };
  return {
    db,
    store,
    node,
    run,
    event,
    service: new ImplementationService(env, definition),
  };
}
test("clarification ignores bots, other people, old and edited comments; only a new read-back reply resumes", async () => {
  const f = await setup("comment"),
    original = globalThis.fetch;
  let calls = 0;
  const reply = {
    id: "reply",
    body: "Use blue",
    createdAt: replied,
    updatedAt: replied,
    editedAt: null as string | null,
    archivedAt: null,
    issue: { id: "issue-1" },
    user: { id: "human" },
  };
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ data: { comment: reply } });
  };
  try {
    for (const overrides of [
      { actor_id: "bot", actor_type: "integration" },
      { actor_id: "another" },
      { provider_time: opened },
      { event_kind: "Comment.update" },
      { event_kind: "Comment.remove" },
    ]) {
      assert.equal(
        (await f.service.gateDecision(f.run, f.node, await f.event(overrides)))
          .kind,
        "wait",
      );
    }
    assert.equal(calls, 0);
    const state = await f.service.gateDecision(
      f.run,
      f.node,
      await f.event({
        event_kind: "Issue.update",
        from_state_id: "review",
        to_state_name: "Merging",
      }),
    );
    assert.equal(state.kind, "repair_gate");
    reply.editedAt = replied;
    assert.equal(
      (await f.service.gateDecision(f.run, f.node, await f.event())).kind,
      "wait",
    );
    reply.editedAt = null;
    const decision = await f.service.gateDecision(
      f.run,
      f.node,
      await f.event(),
    );
    assert.equal(
      decision.kind === "transition" && decision.outcome,
      "reply_received",
    );
    const question = await f.store.question("run-1");
    assert.equal(question?.status, "answered");
    assert.equal(question?.answer_actor_id, "human");
  } finally {
    globalThis.fetch = original;
    f.db.close();
  }
});
test("publication failure posts one Linear question, retaining completed work and the original error",async()=>{
  const f=await setup('comment'), original=globalThis.fetch;
  f.db.sqlite.exec("UPDATE implementation_questions SET status='closed'");
  const diagnostic=await f.store.error('run-1',null,'implementation.write_branch',
    new Error('GitHub POST /git/trees HTTP 403: Resource not accessible by integration', {cause:new Error('provider response')}));
  const comments:{id:string;body:string}[]=[];
  globalThis.fetch=async(_url,init)=>{
    const request=JSON.parse(String(init?.body));
    if(request.query.includes('DeosIssueComments')) return Response.json({data:{issue:{comments:{nodes:comments}}}});
    assert.match(request.query,/DeosCreateComment/);
    comments.push({id:request.variables.commentId,body:request.variables.body});
    return Response.json({data:{commentCreate:{success:true,comment:{id:request.variables.commentId}}}});
  };
  try {
    const work=await f.store.requireRun('run-1');
    const run={...f.run,selection_delivery_id:'opening',previous_node:'implementation_branch_write',current_node:'implementation_publication_question',current_visit_sequence:3};
    await f.service.postPublicationQuestion(run,work);
    await f.service.postPublicationQuestion(run,work);
    assert.equal(comments.length,1);
    assert.match(comments[0].body,/implementation is saved/);
    assert.match(comments[0].body,/HTTP 403: Resource not accessible by integration/);
    assert.match(comments[0].body,/Reply here/);
    const question=await f.store.question('run-1');
    assert.equal(question?.status,'open');
    assert.equal(question?.gate_visit,4);
    assert.equal(question?.linear_comment_id,comments[0].id);
    assert.deepEqual(await f.store.requireRun('run-1'),work);
    const saved=await f.store.read<{error:{cause:{message:string}}}>(diagnostic.key,diagnostic.sha256);
    assert.equal(saved.error.cause.message,'provider response');
  } finally {globalThis.fetch=original;f.db.close();}
});
test("final review cannot consume a comment or a different human state transition", async () => {
  const f = await setup("state");
  try {
    assert.equal(
      (await f.service.gateDecision(f.run, f.node, await f.event())).kind,
      "wait",
    );
    const wrong = await f.service.gateDecision(
      f.run,
      f.node,
      await f.event({
        event_kind: "Issue.update",
        actor_id: "another",
        from_state_id: "review",
        to_state_name: "Merging",
      }),
    );
    assert.equal(wrong.kind, "repair_gate");
    const right = await f.service.gateDecision(
      f.run,
      f.node,
      await f.event({
        event_kind: "Issue.update",
        from_state_id: "review",
        to_state_name: "Merging",
      }),
    );
    assert.equal(
      right.kind === "transition" && right.outcome,
      "merge_authorized",
    );
  } finally {
    f.db.close();
  }
});

test("base drift invalidates an unexecuted merge choice and never carries it into the next gate",async()=>{
 const f=await setup('state');
 try{
 f.db.sqlite.prepare("UPDATE implementation_gates SET state='merge_authorized',decision_outcome='merge_authorized' WHERE run_id='run-1'").run();
 await f.service.invalidate(f.run);
 assert.equal((await f.store.gate('run-1',1))?.state,'merge_choice_not_executed_stale_subject');
 assert.equal((await f.store.requireRun('run-1')).status,'stale');
 assert.equal((await f.service.gateDecision(f.run,f.node,await f.event({event_kind:'Issue.update',from_state_id:'review',to_state_name:'Merging'}))).kind,'wait');
 }finally{f.db.close();}
});
