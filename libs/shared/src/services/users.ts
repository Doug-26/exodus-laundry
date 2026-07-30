import {
  type Firestore,
  type FieldValue,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { toCanonical } from '../utils/phone';
import type { User, UserRole } from '../models/user.model';

/** Thrown by createUserProfile when the (canonical) phone is already registered. */
export class PhoneTakenError extends Error {
  constructor(public readonly phone: string) {
    super(`Phone number already registered: ${phone}`);
    this.name = 'PhoneTakenError';
  }
}

export interface CreateUserProfileInput {
  name: string;
  /** Raw phone in any PH format; normalized to canonical before storage. */
  phoneRaw: string;
  role: UserRole;
}

/** Firestore write shape: createdAt is a server sentinel, not yet a Timestamp. */
type UserWrite = Omit<User, 'createdAt'> & { createdAt: FieldValue };

/**
 * Atomically create users/{uid} and phoneNumbers/{canonicalPhone} in one
 * transaction. Rejects with PhoneTakenError if the phone is already registered,
 * enforcing uniqueness against concurrent writers. Throws (from toCanonical) if
 * the phone is not a valid PH mobile number.
 */
export async function createUserProfile(
  firestore: Firestore,
  uid: string,
  input: CreateUserProfileInput,
): Promise<void> {
  const phone = toCanonical(input.phoneRaw); // throws on invalid input
  const userRef = doc(firestore, 'users', uid);
  const phoneRef = doc(firestore, 'phoneNumbers', phone);

  await runTransaction(firestore, async (tx) => {
    const phoneSnap = await tx.get(phoneRef);
    if (phoneSnap.exists()) {
      throw new PhoneTakenError(phone);
    }
    const userData: UserWrite = {
      role: input.role,
      name: input.name,
      phone,
      fcmTokens: [],
      createdAt: serverTimestamp(),
    };
    tx.set(userRef, userData);
    tx.set(phoneRef, { uid, createdAt: serverTimestamp() });
  });
}

export async function getUserProfile(firestore: Firestore, uid: string): Promise<User | null> {
  const snap = await getDoc(doc(firestore, 'users', uid));
  return snap.exists() ? (snap.data() as User) : null;
}

/**
 * Look up the account that owns a phone number (any PH format).
 * Returns null for an unregistered or invalid number. UX pre-check only —
 * uniqueness enforcement lives in createUserProfile's transaction.
 */
export async function findUserByPhone(
  firestore: Firestore,
  phoneRaw: string,
): Promise<{ uid: string } | null> {
  let canonical: string;
  try {
    canonical = toCanonical(phoneRaw);
  } catch {
    return null;
  }
  const snap = await getDoc(doc(firestore, 'phoneNumbers', canonical));
  return snap.exists() ? { uid: (snap.data() as { uid: string }).uid } : null;
}

/**
 * Look up a CUSTOMER account by phone (any PH format), returning name only
 * (never address — §10 privacy). Returns null for no match, an invalid number,
 * or a phone that belongs to a non-customer (staff/rider/admin) account.
 */
export async function lookupCustomerByPhone(
  firestore: Firestore,
  phoneRaw: string,
): Promise<{ uid: string; name: string } | null> {
  const match = await findUserByPhone(firestore, phoneRaw);
  if (!match) {
    return null;
  }
  const profile = await getUserProfile(firestore, match.uid);
  if (!profile || profile.role !== 'customer') {
    return null;
  }
  return { uid: match.uid, name: profile.name };
}

export type { UserRole };
