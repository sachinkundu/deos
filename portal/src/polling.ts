export interface PollState<T> {
  applied: T | null;
  staged: T | null;
  error: string | null;
}

export const stablePayload = (value: unknown): string => JSON.stringify(value);

export const receivePoll = <T>(state: PollState<T>, value: T): PollState<T> => {
  if (state.applied === null) return { applied: value, staged: null, error: null };
  if (stablePayload(state.applied) === stablePayload(value)) return { ...state, error: null };
  return { ...state, staged: value, error: null };
};

export const applyStaged = <T>(state: PollState<T>): PollState<T> => state.staged === null
  ? state
  : { applied: state.staged, staged: null, error: null };
