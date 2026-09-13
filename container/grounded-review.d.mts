export function lineClaims(files: readonly { path: string; content: string }[]): Record<string,string>;
export function claimStrings(value: unknown, prefix?: string): Record<string,string>;
export function unwrapGroundedReview(envelope: unknown): any;
