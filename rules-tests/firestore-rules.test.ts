import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'exodus-rules-test';
let testEnv: RulesTestEnvironment;

// Role fixtures seeded once (rules-bypassed) so roleIs() resolves.
const CUSTOMER = 'customer1';
const CUSTOMER2 = 'customer2';
const STAFF = 'staff1';
const ADMIN = 'admin1';
const RIDER = 'rider1';
const RIDER2 = 'rider2';

const baseOrder = (over: Record<string, unknown>) => ({
  customerId: null,
  guestContact: { name: 'Ana', phone: '+639171234567' },
  createdBy: STAFF,
  source: 'walk_in',
  claimNumber: '0101-001',
  status: 'received',
  fulfilment: null,
  intakeMethod: null,
  service: 'wash_fold',
  loadCount: null,
  weightKg: null,
  price: null,
  notes: '',
  destination: null,
  shopLocation: { lat: 13.6, lng: 123.2 },
  assignedRiderId: null,
  routeCache: null,
  active: true,
  statusHistory: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', CUSTOMER), { role: 'customer', name: 'Ana', phone: '+639171234567' });
    await setDoc(doc(db, 'users', CUSTOMER2), { role: 'customer', name: 'Ben', phone: '+639170000002' });
    await setDoc(doc(db, 'users', STAFF), { role: 'staff', name: 'Sta', phone: '+639170000003' });
    await setDoc(doc(db, 'users', ADMIN), { role: 'admin', name: 'Adm', phone: '+639170000004' });
    await setDoc(doc(db, 'users', RIDER), { role: 'rider', name: 'Rid', phone: '+639170000005' });
    await setDoc(doc(db, 'users', RIDER2), { role: 'rider', name: 'Ri2', phone: '+639170000006' });
  });
});

afterAll(async () => testEnv?.cleanup());
beforeEach(async () => {
  // Reset only the orders/counters between tests; keep the user role fixtures.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'orders', 'ord_ready'), baseOrder({ customerId: CUSTOMER, status: 'ready' }));
    await setDoc(
      doc(db, 'orders', 'ord_ofd'),
      baseOrder({ customerId: CUSTOMER, status: 'out_for_delivery', assignedRiderId: RIDER, fulfilment: 'delivery' }),
    );
    await setDoc(doc(db, 'orders', 'ord_fd'), baseOrder({ status: 'for_delivery', fulfilment: 'delivery' }));
    await setDoc(doc(db, 'counters', 'ctr'), { seq: 5 });
  });
});

const dbOf = (uid: string) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

describe('users', () => {
  it('owner reads own doc; cannot read another', async () => {
    await assertSucceeds(getDoc(doc(dbOf(CUSTOMER), 'users', CUSTOMER)));
    await assertFails(getDoc(doc(dbOf(CUSTOMER), 'users', CUSTOMER2)));
  });
  it('staff reads any user', async () => {
    await assertSucceeds(getDoc(doc(dbOf(STAFF), 'users', CUSTOMER)));
  });
  it('self-signup as customer succeeds; as staff fails', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf('newcust'), 'users', 'newcust'), { role: 'customer', name: 'N', phone: '+639170000009', fcmTokens: [] }),
    );
    await assertFails(
      setDoc(doc(dbOf('sneaky'), 'users', 'sneaky'), { role: 'staff', name: 'X', phone: '+639170000010', fcmTokens: [] }),
    );
  });
  it('owner cannot escalate their own role', async () => {
    await assertFails(updateDoc(doc(dbOf(CUSTOMER), 'users', CUSTOMER), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(dbOf(CUSTOMER), 'users', CUSTOMER), { name: 'Ana R.' }));
  });
});

describe('orders — read', () => {
  it('customer reads own; not another customer\'s', async () => {
    await assertSucceeds(getDoc(doc(dbOf(CUSTOMER), 'orders', 'ord_ready')));
    await assertFails(getDoc(doc(dbOf(CUSTOMER2), 'orders', 'ord_ready')));
  });
  it('rider reads a delivery-stage order but not a ready one', async () => {
    await assertSucceeds(getDoc(doc(dbOf(RIDER), 'orders', 'ord_fd')));
    await assertFails(getDoc(doc(dbOf(RIDER), 'orders', 'ord_ready')));
  });
  it('staff reads any order', async () => {
    await assertSucceeds(getDoc(doc(dbOf(STAFF), 'orders', 'ord_ready')));
  });
  it('anonymous cannot read', async () => {
    await assertFails(getDoc(doc(anon(), 'orders', 'ord_ready')));
  });
});

describe('orders — create', () => {
  it('customer creates own app order', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf(CUSTOMER), 'orders', 'new1'), baseOrder({
        source: 'app', customerId: CUSTOMER, createdBy: CUSTOMER, status: 'requested',
      })),
    );
  });
  it('customer cannot create an order owned by someone else', async () => {
    await assertFails(
      setDoc(doc(dbOf(CUSTOMER), 'orders', 'new2'), baseOrder({
        source: 'app', customerId: CUSTOMER2, createdBy: CUSTOMER, status: 'requested',
      })),
    );
  });
  it('staff creates a walk-in', async () => {
    await assertSucceeds(setDoc(doc(dbOf(STAFF), 'orders', 'new3'), baseOrder({ status: 'received' })));
  });
});

describe('orders — customer update', () => {
  it('confirm delivery on own ready order', async () => {
    await assertSucceeds(
      updateDoc(doc(dbOf(CUSTOMER), 'orders', 'ord_ready'), {
        destination: { lat: 13.6, lng: 123.2, addressNote: 'gate' },
        fulfilment: 'delivery', status: 'for_delivery', active: true,
        updatedAt: new Date(), statusHistory: [{ status: 'for_delivery', at: new Date() }],
      }),
    );
  });
  it('customer cannot jump their order straight to completed', async () => {
    await assertFails(
      updateDoc(doc(dbOf(CUSTOMER), 'orders', 'ord_ready'), {
        status: 'completed', active: false, updatedAt: new Date(), statusHistory: [],
      }),
    );
  });
});

describe('orders — rider update', () => {
  it('assigned rider completes their delivery', async () => {
    await assertSucceeds(
      updateDoc(doc(dbOf(RIDER), 'orders', 'ord_ofd'), {
        status: 'completed', active: false, updatedAt: new Date(),
        statusHistory: [{ status: 'completed', at: new Date() }],
      }),
    );
  });
  it('a different rider cannot complete it', async () => {
    await assertFails(
      updateDoc(doc(dbOf(RIDER2), 'orders', 'ord_ofd'), {
        status: 'completed', active: false, updatedAt: new Date(), statusHistory: [],
      }),
    );
  });
});

describe('counters', () => {
  it('monotonic +1 update succeeds; a jump fails', async () => {
    await assertSucceeds(updateDoc(doc(dbOf(CUSTOMER), 'counters', 'ctr'), { seq: 6 }));
  });
  it('a seq jump fails', async () => {
    await assertFails(updateDoc(doc(dbOf(CUSTOMER), 'counters', 'ctr'), { seq: 99 }));
  });
});

describe('phoneNumbers', () => {
  it('create own mapping; not for another uid; no update', async () => {
    await assertSucceeds(setDoc(doc(dbOf('pnu'), 'phoneNumbers', '+639171111111'), { uid: 'pnu' }));
    await assertFails(setDoc(doc(dbOf('pnu'), 'phoneNumbers', '+639172222222'), { uid: 'someoneElse' }));
  });
});
