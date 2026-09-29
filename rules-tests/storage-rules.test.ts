import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes } from 'firebase/storage';

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

  it('denies paths outside avatars/ (Phase 14 adds its own rules)', async () => {
    const storage = testEnv.authenticatedContext(OWNER).storage();
    await assertFails(uploadBytes(ref(storage, `proof/${OWNER}/photo.jpg`), bytes(), asJpeg));
  });
});
