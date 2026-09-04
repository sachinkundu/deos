import { WorkerEntrypoint } from "cloudflare:workers";

import {
  authorizeRouteAdminActor,
  RouteAdminService,
  type RouteAdminOverview,
  type RouteRepositoryInput,
} from "./route-admin.ts";
import type { RepositoryRouteView } from "./repository-routes.ts";
import { AgentStageRetryController, D1AgentStageRetryStore } from "./stage-retry.ts";
import type { QueueConsumerEnv } from "./queue-consumer-core.ts";
import { loadBundledWorkflowDefinitionRegistry } from "./workflow-bundle.ts";

export interface PortalRunRetryInput {
  runId: string;
  failedAttemptId: string;
  retryNode: string;
}

export interface PortalRunRetryResult {
  retryId: string;
  runId: string;
  retryNode: string;
  state: string;
}

export class RouteAdmin extends WorkerEntrypoint<Env> {
  private service(): RouteAdminService {
    return new RouteAdminService(this.env);
  }

  overview(actorEmail: string): Promise<RouteAdminOverview> {
    return this.service().overview(actorEmail);
  }

  createRoute(actorEmail: string, input: RouteRepositoryInput): Promise<RepositoryRouteView> {
    return this.service().createRoute(actorEmail, input);
  }

  saveRepository(
    actorEmail: string,
    input: RouteRepositoryInput & { expectedRevision: number },
  ): Promise<RepositoryRouteView> {
    return this.service().saveRepository(actorEmail, input);
  }

  saveWorkflow(actorEmail: string, input: {
    projectId: string;
    dispatchEnabled: boolean;
    expectedRevision: number;
  }): Promise<RepositoryRouteView> {
    return this.service().saveWorkflow(actorEmail, input);
  }

  saveReview(actorEmail: string, input: {
    projectId: string;
    model: string;
    expectedRevision: number;
  }): Promise<RepositoryRouteView> {
    return this.service().saveReview(actorEmail, input);
  }

  recheck(actorEmail: string, input: { projectId: string }): Promise<RepositoryRouteView> {
    return this.service().recheck(actorEmail, input);
  }

  async retryRun(actorEmail: string, input: PortalRunRetryInput): Promise<PortalRunRetryResult> {
    authorizeRouteAdminActor(actorEmail, this.env.ROUTE_ADMIN_ALLOWED_EMAIL);
    const definitions = await loadBundledWorkflowDefinitionRegistry();
    const targetDefinition = definitions["simple-traceability"];
    if (targetDefinition === undefined) throw new Error("traceability workflow definition is missing");
    const controller = new AgentStageRetryController(
      new D1AgentStageRetryStore(this.env.DB),
      this.env.ORCHESTRATION_WORKFLOW as unknown as QueueConsumerEnv["ORCHESTRATION_WORKFLOW"],
      this.env.STAGE_RETRY_SECRET,
      targetDefinition,
    );
    const response = await controller.handle(new Request("https://internal.invalid/stage-retries", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.STAGE_RETRY_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version: 1, ...input, requestedBy: actorEmail }),
    }));
    const body = await response.json() as {
      error?: string;
      retry?: { retry_id: string; run_id: string; retry_node: string; state: string };
    };
    if (!response.ok || body.retry === undefined) {
      throw new Error(body.error ?? "stage_retry_failed");
    }
    return {
      retryId: body.retry.retry_id,
      runId: body.retry.run_id,
      retryNode: body.retry.retry_node,
      state: body.retry.state,
    };
  }
}
