interface Env {
  /** Set only on an isolated lease runtime; credentials stay in the coordinator. */
  REVIEW_PROVIDER_TRANSPORT?:Fetcher;
}
