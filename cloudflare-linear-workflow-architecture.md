# Cloudflare Architecture: Linear-Driven AI Delivery Workflow

This is the initial serverless boundary for the workflow in `1786013157284.jpeg`.
The webhook acknowledges Linear quickly; durable processing happens asynchronously.

```mermaid
flowchart LR
    linear[Linear workspace\nIssue state changes]

    subgraph edge[Cloudflare edge]
        webhook[Worker: Linear webhook\nHTTPS POST endpoint]
        verify[Validate raw body\nHMAC signature + timestamp]
        filter[Workflow gate\nProject, team, state, actor]
    end

    subgraph control[Cloudflare control plane]
        queue[Queues\nDurable event buffer]
        dispatcher[Worker: Dispatcher\nState-machine transition]
        workflow[Workflow runner\nLong-running orchestration]
        idempotency[D1\nDeliveries, runs, transitions]
        config[D1\nProject connections + policy]
        coordination[Durable Object\nPer-project serialization]
    end

    subgraph execution[Agent execution]
        requirements[Requirements Agent]
        review[Requirements Review Agent]
        architecture[DDD Architect / Reviewer]
        implementation[Implementation Agent]
        evidence[Evidence Verifier / Release Agent]
    end

    subgraph artifacts[Durable artifacts]
        r2[R2\nOpenSpec artifacts, logs, evidence packs]
        vcs[VCS provider\nBranches, commits, pull requests]
    end

    linear -->|POST webhook| webhook
    webhook --> verify
    verify -->|invalid| reject[401 / 400]
    verify -->|valid| filter
    filter -->|irrelevant| ignore[200 + ignored event]
    filter -->|relevant| idempotency
    idempotency -->|new delivery| queue
    idempotency -->|duplicate| duplicate[200 + duplicate]
    webhook -.->|fast acknowledgement| linear

    queue --> dispatcher
    dispatcher --> config
    dispatcher --> coordination
    coordination --> workflow
    workflow --> requirements
    workflow --> review
    workflow --> architecture
    workflow --> implementation
    workflow --> evidence

    requirements --> r2
    review --> r2
    architecture --> r2
    implementation --> vcs
    implementation --> r2
    evidence --> r2
    evidence --> vcs
    workflow --> idempotency
    workflow -->|Linear comments, labels, state updates| linear
```

## Initial responsibility of each component

| Component | Responsibility | First version |
|---|---|---|
| Worker webhook | Authenticate and classify Linear events | Required |
| Queues | Decouple Linear delivery from agent execution | Required |
| D1 | Idempotency, project mapping, workflow state, audit trail | Required |
| Dispatcher Worker | Convert an issue transition into a workflow command | Required |
| Workflows | Coordinate multi-step agent work and approvals | Later in the first slice |
| Durable Objects | Serialize concurrent events for one project or issue | Add when concurrency matters |
| R2 | Store OpenSpec and evidence artifacts | Required once agents produce files |

## First slice

Start with one connected Linear project and one transition, for example:

```text
Linear state change
  -> verify and deduplicate
  -> enqueue event
  -> dispatcher loads project policy
  -> create a workflow run
  -> invoke the Requirements Agent
  -> write proposal.md / requirements.md to R2
  -> post a Linear comment and wait for the next human decision
```

The webhook should never decide that an issue is ready for implementation by
itself. It should emit a normalized event; the dispatcher and workflow state
machine should make that decision using the configured project policy.
