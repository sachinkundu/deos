import {SharedTestReleaseLinkStore} from './shared-test-release-link.ts';

export type SharedTestGuardMode = 'observe'|'enforce';

export interface SharedTestGuardResult {
  allowed:boolean;
  mode:SharedTestGuardMode;
  proofAllowed:boolean;
  choice:string|null;
  candidateCommit:string|null;
  releaseCommit:string;
}

/** A release caller must pass the exact commit it will deploy and its changed paths. */
export class SharedTestReleaseGuard {
  readonly links:SharedTestReleaseLinkStore;
  readonly mode:SharedTestGuardMode;
  constructor(db:D1Database,mode:SharedTestGuardMode) {
    if (mode!=='observe' && mode!=='enforce') throw new Error('invalid_test_guard_mode');
    this.links=new SharedTestReleaseLinkStore(db);
    this.mode=mode;
  }

  async check(releaseCommit:string,changedPaths:readonly string[]):Promise<SharedTestGuardResult> {
    if (!/^[a-f0-9]{40}$/.test(releaseCommit) || !Array.isArray(changedPaths) ||
        changedPaths.some(path=>typeof path!=='string' || !path || path.startsWith('/') ||
          path.split('/').includes('..')))
      throw new Error('invalid_test_release_guard_subject');
    const proof=await this.links.check(releaseCommit,changedPaths);
    return {allowed:this.mode==='observe' || proof.allowed,mode:this.mode,
      proofAllowed:proof.allowed,choice:proof.choice,
      candidateCommit:proof.candidateCommit,releaseCommit};
  }
}
