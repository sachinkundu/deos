export const designReviewOutputSchema: {
  readonly properties: {
    readonly version: { readonly type: "integer" };
    readonly phase: { readonly type: "string" };
    readonly outcome: { readonly type: "string" };
    readonly findings: {
      readonly items: {
        readonly properties: {
          readonly severity: { readonly type: "string" };
          readonly category: { readonly type: "string" };
        };
      };
    };
  };
};
