import {
  addFcmToken,
  createUserProfile,
  findUserByPhone,
  getUserProfile,
  lookupCustomerByPhone,
  removeFcmToken,
  PhoneTakenError,
} from './users';
import { __mockState, __resetMockState } from '../../__mocks__/firebase-firestore';

// The Firestore instance is never used by the mock; cast a stub to the param type.
const db = {} as Parameters<typeof createUserProfile>[0];

describe('createUserProfile', () => {
  beforeEach(() => __resetMockState());

  it('stores the phone canonically and writes both users/ and phoneNumbers/ docs', async () => {
    await createUserProfile(db, 'uid1', { name: 'Ana', phoneRaw: '0917 123 4567', role: 'customer' });

    const userSet = __mockState.setCalls.find((c) => c.collection === 'users');
    const phoneSet = __mockState.setCalls.find((c) => c.collection === 'phoneNumbers');

    expect(userSet?.id).toBe('uid1');
    expect(userSet?.data['phone']).toBe('+639171234567');
    expect(userSet?.data['role']).toBe('customer');
    expect(userSet?.data['fcmTokens']).toEqual([]);

    expect(phoneSet?.id).toBe('+639171234567');
    expect(phoneSet?.data['uid']).toBe('uid1');
  });

  it('rejects with PhoneTakenError when the phone already exists, writing nothing', async () => {
    __mockState.phoneExists = true;

    await expect(
      createUserProfile(db, 'uid2', { name: 'Ben', phoneRaw: '+639171234567', role: 'customer' }),
    ).rejects.toBeInstanceOf(PhoneTakenError);

    expect(__mockState.setCalls).toHaveLength(0);
  });

  it('rejects an invalid phone before touching Firestore', async () => {
    await expect(
      createUserProfile(db, 'uid3', { name: 'Cy', phoneRaw: 'notaphone', role: 'customer' }),
    ).rejects.toThrow();

    expect(__mockState.setCalls).toHaveLength(0);
  });
});

describe('findUserByPhone', () => {
  beforeEach(() => __resetMockState());

  it('returns the uid for a registered phone given in any format', async () => {
    __mockState.phoneExists = true;
    __mockState.phoneDocData = { uid: 'uidX' };

    await expect(findUserByPhone(db, '0917 123 4567')).resolves.toEqual({ uid: 'uidX' });
  });

  it('returns null for an unregistered phone', async () => {
    await expect(findUserByPhone(db, '+639171234567')).resolves.toBeNull();
  });

  it('returns null for an invalid phone', async () => {
    await expect(findUserByPhone(db, 'garbage')).resolves.toBeNull();
  });
});

describe('getUserProfile', () => {
  beforeEach(() => __resetMockState());

  it('returns the profile when the doc exists', async () => {
    __mockState.userDocData = {
      role: 'admin',
      name: 'Boss',
      phone: '+639171234567',
      fcmTokens: [],
      createdAt: {},
    };

    const user = await getUserProfile(db, 'uid1');
    expect(user?.role).toBe('admin');
    expect(user?.phone).toBe('+639171234567');
  });

  it('returns null when the doc is absent', async () => {
    await expect(getUserProfile(db, 'uid1')).resolves.toBeNull();
  });
});

describe('lookupCustomerByPhone', () => {
  beforeEach(() => __resetMockState());

  it('returns {uid,name} for a registered customer', async () => {
    __mockState.phoneExists = true;
    __mockState.phoneDocData = { uid: 'cust1' };
    __mockState.userDocData = { role: 'customer', name: 'Ana', phone: '+639171234567', fcmTokens: [] };

    await expect(lookupCustomerByPhone(db, '0917 123 4567')).resolves.toEqual({
      uid: 'cust1',
      name: 'Ana',
    });
  });

  it('returns null when the phone belongs to a non-customer (e.g. staff)', async () => {
    __mockState.phoneExists = true;
    __mockState.phoneDocData = { uid: 'staff1' };
    __mockState.userDocData = { role: 'staff', name: 'Boss', phone: '+639171234567', fcmTokens: [] };

    await expect(lookupCustomerByPhone(db, '+639171234567')).resolves.toBeNull();
  });

  it('returns null for an unregistered phone', async () => {
    await expect(lookupCustomerByPhone(db, '+639170000000')).resolves.toBeNull();
  });
});

describe('addFcmToken / removeFcmToken', () => {
  beforeEach(() => __resetMockState());

  it('adds a token via arrayUnion on users/{uid}', async () => {
    await addFcmToken(db, 'uid1', 'tok-abc');

    const call = __mockState.updateCalls.find((c) => c.collection === 'users');
    expect(call?.id).toBe('uid1');
    expect(call?.data['fcmTokens']).toEqual({ __arrayUnion: ['tok-abc'] });
  });

  it('removes a token via arrayRemove on users/{uid}', async () => {
    await removeFcmToken(db, 'uid1', 'tok-abc');

    const call = __mockState.updateCalls.find((c) => c.collection === 'users');
    expect(call?.id).toBe('uid1');
    expect(call?.data['fcmTokens']).toEqual({ __arrayRemove: ['tok-abc'] });
  });
});
