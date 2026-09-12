export function readCommand(command: string): { op: string; args: string[] };
export function readSnapshot(command: { op: string; args: string[] }, state: unknown, sourceRoot?: string): Promise<string>;
