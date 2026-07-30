// Controllable mock for `firebase/firestore` used by users.spec.ts and orders.spec.ts.
// Tests mutate __mockState to drive transaction/getDoc behaviour.

export class Timestamp {
  constructor(
    public readonly seconds: number,
    public readonly nanoseconds: number,
  ) {}

  static now(): Timestamp {
    return new Timestamp(Math.floor(Date.now() / 1000), 0);
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000);
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }
}

interface WriteCall {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  merge?: boolean;
}

interface MockState {
  // users.spec.ts
  phoneExists: boolean;
  phoneDocData: Record<string, unknown> | undefined;
  userDocData: Record<string, unknown> | undefined;
  // orders.spec.ts
  counterExists: boolean;
  counterSeq: number;
  // shared
  setCalls: WriteCall[];
  updateCalls: WriteCall[];
}

export const __mockState: MockState = {
  phoneExists: false,
  phoneDocData: undefined,
  userDocData: undefined,
  counterExists: false,
  counterSeq: 0,
  setCalls: [],
  updateCalls: [],
};

export function __resetMockState(): void {
  __mockState.phoneExists = false;
  __mockState.phoneDocData = undefined;
  __mockState.userDocData = undefined;
  __mockState.counterExists = false;
  __mockState.counterSeq = 0;
  __mockState.setCalls = [];
  __mockState.updateCalls = [];
}

interface Ref {
  collection: string;
  id: string;
}

interface CollectionRef {
  __collection: string;
}

let autoId = 0;

export function collection(_db: unknown, name: string): CollectionRef {
  return { __collection: name };
}

// Supports both doc(db, collection, id) and doc(collectionRef) → auto id.
export function doc(dbOrColl: unknown, collectionName?: string, id?: string): Ref {
  if (dbOrColl !== null && typeof dbOrColl === 'object' && '__collection' in dbOrColl) {
    autoId += 1;
    return { collection: (dbOrColl as CollectionRef).__collection, id: `auto-${autoId}` };
  }
  return { collection: collectionName as string, id: id as string };
}

export function serverTimestamp(): { __sentinel: 'serverTimestamp' } {
  return { __sentinel: 'serverTimestamp' };
}

export function arrayUnion(...items: unknown[]): { __arrayUnion: unknown[] } {
  return { __arrayUnion: items };
}

function snapFor(ref: Ref) {
  if (ref.collection === 'phoneNumbers') {
    return { exists: () => __mockState.phoneExists, data: () => __mockState.phoneDocData };
  }
  if (ref.collection === 'counters') {
    return { exists: () => __mockState.counterExists, data: () => ({ seq: __mockState.counterSeq }) };
  }
  return { exists: () => __mockState.userDocData !== undefined, data: () => __mockState.userDocData };
}

export function getDoc(ref: Ref) {
  return Promise.resolve(snapFor(ref));
}

export function runTransaction<T>(_db: unknown, updateFn: (tx: unknown) => Promise<T>): Promise<T> {
  const tx = {
    get: (ref: Ref) => Promise.resolve(snapFor(ref)),
    set: (ref: Ref, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      __mockState.setCalls.push({ collection: ref.collection, id: ref.id, data, merge: options?.merge });
    },
  };
  return Promise.resolve(updateFn(tx));
}

export function updateDoc(ref: Ref, data: Record<string, unknown>): Promise<void> {
  __mockState.updateCalls.push({ collection: ref.collection, id: ref.id, data });
  return Promise.resolve();
}

// Query/subscription stubs — orders.ts imports these; unit tests don't call them.
export function query(...args: unknown[]): { __query: unknown[] } {
  return { __query: args };
}

export function where(field: string, op: string, value: unknown): Record<string, unknown> {
  return { field, op, value };
}

export function onSnapshot(): () => void {
  return () => undefined;
}
