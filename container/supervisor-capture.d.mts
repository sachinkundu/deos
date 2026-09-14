import type { WriteStream } from "node:fs";
export function trustedCapture(name: string, root?: string): Promise<{stream: WriteStream; finalize(destination: string, replace?: boolean): Promise<void>}>;
export function recoverCaptures(root?: string, output?: string): Promise<void>;
