// Controllable mock for `firebase/database` used by tracking.spec.ts.
// Captures ref paths + set/remove payloads and lets tests drive onValue snapshots.

interface SetCall {
  path: string;
  value: unknown;
}

interface MockState {
  setCalls: SetCall[];
  removePaths: string[];
  // The value delivered to the next onValue subscriber.
  nextValue: unknown;
}

export const __mockState: MockState = {
  setCalls: [],
  removePaths: [],
  nextValue: null,
};

export function __resetMockState(): void {
  __mockState.setCalls = [];
  __mockState.removePaths = [];
  __mockState.nextValue = null;
}

// A ref is just its path string wrapped so set/remove/onValue can read it back.
interface Ref {
  path: string;
}

export function ref(_db: unknown, path: string): Ref {
  return { path };
}

export function set(r: Ref, value: unknown): Promise<void> {
  __mockState.setCalls.push({ path: r.path, value });
  return Promise.resolve();
}

export function remove(r: Ref): Promise<void> {
  __mockState.removePaths.push(r.path);
  return Promise.resolve();
}

export function onValue(_r: Ref, cb: (snap: { val: () => unknown }) => void): () => void {
  cb({ val: () => __mockState.nextValue });
  return () => undefined;
}
