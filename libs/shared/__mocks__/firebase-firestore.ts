// Controllable mock for `firebase/firestore` used by users.spec.ts.
// Tests mutate __mockState to drive transaction/getDoc behaviour.

export class Timestamp {
  constructor(
    public readonly seconds: number,
    public readonly nanoseconds: number,
  ) {}
}

interface SetCall {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

interface MockState {
  phoneExists: boolean;
  phoneDocData: Record<string, unknown> | undefined;
  userDocData: Record<string, unknown> | undefined;
  setCalls: SetCall[];
}

export const __mockState: MockState = {
  phoneExists: false,
  phoneDocData: undefined,
  userDocData: undefined,
  setCalls: [],
};

export function __resetMockState(): void {
  __mockState.phoneExists = false;
  __mockState.phoneDocData = undefined;
  __mockState.userDocData = undefined;
  __mockState.setCalls = [];
}

interface Ref {
  collection: string;
  id: string;
}

export function doc(_db: unknown, collection: string, id: string): Ref {
  return { collection, id };
}

export function serverTimestamp(): { __sentinel: 'serverTimestamp' } {
  return { __sentinel: 'serverTimestamp' };
}

function snapFor(ref: Ref) {
  if (ref.collection === 'phoneNumbers') {
    return {
      exists: () => __mockState.phoneExists,
      data: () => __mockState.phoneDocData,
    };
  }
  return {
    exists: () => __mockState.userDocData !== undefined,
    data: () => __mockState.userDocData,
  };
}

export function getDoc(ref: Ref) {
  return Promise.resolve(snapFor(ref));
}

export function runTransaction<T>(_db: unknown, updateFn: (tx: unknown) => Promise<T>): Promise<T> {
  const tx = {
    get: (ref: Ref) => Promise.resolve(snapFor(ref)),
    set: (ref: Ref, data: Record<string, unknown>) => {
      __mockState.setCalls.push({ collection: ref.collection, id: ref.id, data });
    },
  };
  return Promise.resolve(updateFn(tx));
}
