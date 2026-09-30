import {GitHubAppTokenProvider,GitHubCapabilityAdapter} from './github-capability.ts';

/** The lease runtime binds a fenced provider proxy. Production uses its normal
 * credentials and the same provider adapters, validation, and state machine. */
export type ReviewProviderEnv=Pick<Env,
  'GITHUB_API_URL'|'GITHUB_APP_ID'|'GITHUB_APP_PRIVATE_KEY'> & {
    REVIEW_PROVIDER_TRANSPORT?:Fetcher;
  };

export function reviewProviderFetch(env:{REVIEW_PROVIDER_TRANSPORT?:Fetcher}):typeof fetch {
  return env.REVIEW_PROVIDER_TRANSPORT
    ?(input,init)=>env.REVIEW_PROVIDER_TRANSPORT!.fetch(new Request(input,init))
    :globalThis.fetch.bind(globalThis);
}

export function reviewGitHubAdapter(env:ReviewProviderEnv,installationId:string) {
  const tokens=env.REVIEW_PROVIDER_TRANSPORT
    ?{token:async()=>'lease-provider-proxy'}
    :new GitHubAppTokenProvider({apiUrl:env.GITHUB_API_URL,appId:env.GITHUB_APP_ID,
      privateKey:env.GITHUB_APP_PRIVATE_KEY,installationId});
  return new GitHubCapabilityAdapter(env.GITHUB_API_URL,tokens,
    {fetch:reviewProviderFetch(env)});
}
