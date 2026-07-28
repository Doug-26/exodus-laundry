import { createUserProfile, findUserByPhone, getUserProfile, PhoneTakenError } from './users';
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
