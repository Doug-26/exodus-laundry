import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';

// Must match the firestore suite: firebase.json sets singleProjectMode.
const PROJECT_ID = 'exodus-rules-test';

const OWNER = 'customer1';
const OTHER = 'customer2';

let testEnv: RulesTestEnvironment;

/** A few JPEG magic bytes — enough for the emulator, well under the 2MB cap. */
const bytes = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const asJpeg = { contentType: 'image/jpeg' };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules: readFileSync(join(__dirname, '..', 'storage.rules'), 'utf8') },
  });
});

afterAll(async () => testEnv?.cleanup());

describe('storage — avatars', () => {
  it('owner uploads their own avatar', async () => {
    const storage = testEnv.authenticatedContext(OWNER).storage();
    await assertSucceeds(uploadBytes(ref(storage, `avatars/${OWNER}/avatar.jpg`), bytes(), asJpeg));
  });

  it('a different signed-in user cannot write it', async () => {
    const storage = testEnv.authenticatedContext(OTHER).storage();
    await assertFails(uploadBytes(ref(storage, `avatars/${OWNER}/avatar.jpg`), bytes(), asJpeg));
  });

  it('anonymous cannot write', async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(storage, `avatars/${OWNER}/avatar.jpg`), bytes(), asJpeg));
  });

  it('rejects a non-image content type', async () => {
    const storage = testEnv.authenticatedContext(OWNER).storage();
    await assertFails(
      uploadBytes(ref(storage, `avatars/${OWNER}/avatar.jpg`), bytes(), {
        contentType: 'application/pdf',
      }),
    );
  });

  it('denies an unknown top-level path', async () => {
    const storage = testEnv.authenticatedContext(OWNER).storage();
    await assertFails(uploadBytes(ref(storage, `scratch/${OWNER}/photo.jpg`), bytes(), asJpeg));
  });
});

describe('storage — proof photos (role claim)', () => {
  const ORDER = 'order123';
  const path = `proof/${ORDER}/shot1.jpg`;

  // The `role` custom claim is what storage.rules reads — Storage rules cannot
  // reach Firestore, so the claim is the only role signal in these tests.
  const staff = () => testEnv.authenticatedContext('staff1', { role: 'staff' }).storage();
  const admin = () => testEnv.authenticatedContext('admin1', { role: 'admin' }).storage();
  const customer = () => testEnv.authenticatedContext(OWNER, { role: 'customer' }).storage();

  it('staff uploads a proof photo', async () => {
    await assertSucceeds(uploadBytes(ref(staff(), path), bytes(), asJpeg));
  });

  it('admin uploads a proof photo', async () => {
    await assertSucceeds(uploadBytes(ref(admin(), path), bytes(), asJpeg));
  });

  it('a customer cannot upload one', async () => {
    await assertFails(uploadBytes(ref(customer(), path), bytes(), asJpeg));
  });

  it('a signed-in user with no role claim cannot upload one', async () => {
    const noClaim = testEnv.authenticatedContext('nobody').storage();
    await assertFails(uploadBytes(ref(noClaim, path), bytes(), asJpeg));
  });

  it('anonymous cannot upload one', async () => {
    await assertFails(uploadBytes(ref(testEnv.unauthenticatedContext().storage(), path), bytes(), asJpeg));
  });

  it('rejects a non-image content type', async () => {
    await assertFails(
      uploadBytes(ref(staff(), path), bytes(), { contentType: 'application/pdf' }),
    );
  });

  it('staff can delete a proof photo', async () => {
    await assertSucceeds(uploadBytes(ref(staff(), path), bytes(), asJpeg));
    await assertSucceeds(deleteObject(ref(staff(), path)));
  });

  it('a customer cannot delete one', async () => {
    await assertSucceeds(uploadBytes(ref(staff(), path), bytes(), asJpeg));
    await assertFails(deleteObject(ref(customer(), path)));
  });
});
