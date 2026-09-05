import { WorkerEntrypoint } from "cloudflare:workers";

import {
  RouteAdminService,
  type RouteAdminOverview,
  type RouteRepositoryInput,
} from "./route-admin.ts";
import type { RepositoryRouteView } from "./repository-routes.ts";

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
}
