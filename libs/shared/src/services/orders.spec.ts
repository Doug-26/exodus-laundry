import {
  activeFor,
  cancelOrder,
  createOrder,
  dailyKey,
  formatClaimNumber,
  InvalidTransitionError,
  linkGuestOrdersToCustomer,
  nextStatus,
  serviceLabel,
  setFulfilment,
  updateOrderStatus,
  type CreateOrderInput,
} from './orders';
import { __mockState, __resetMockState } from '../../__mocks__/firebase-firestore';

const db = {} as Parameters<typeof createOrder>[0];

const validInput: CreateOrderInput = {
  createdBy: 'staff1',
  guestName: 'Ana',
  guestPhoneRaw: '0917 123 4567',
  service: 'wash_fold',
  weightKg: 5,
  loadCount: null,
  price: 250,
  notes: 'separate whites',
  shopLocation: { lat: 13.6, lng: 123.1 },
};

describe('dailyKey (Asia/Manila)', () => {
  it('uses Manila date, not UTC, near midnight', () => {
    // 2026-07-30T20:00Z is 2026-07-31 04:00 in Manila (UTC+8)
    expect(dailyKey(new Date('2026-07-30T20:00:00Z'))).toBe('0731');
    // 2026-07-30T15:00Z is 2026-07-30 23:00 in Manila
    expect(dailyKey(new Date('2026-07-30T15:00:00Z'))).toBe('0730');
  });

  it('zero-pads month and day', () => {
    expect(dailyKey(new Date('2026-01-05T04:00:00Z'))).toBe('0105');
  });
});

describe('formatClaimNumber', () => {
  it('zero-pads the sequence to 3 digits', () => {
    expect(formatClaimNumber('0730', 1)).toBe('0730-001');
    expect(formatClaimNumber('0730', 14)).toBe('0730-014');
  });

  it('does not truncate sequences above 999', () => {
    expect(formatClaimNumber('0730', 1000)).toBe('0730-1000');
  });
});

describe('nextStatus', () => {
  it('walks the linear pre-ready flow', () => {
    expect(nextStatus('received', null)).toBe('washing');
    expect(nextStatus('washing', null)).toBe('drying');
    expect(nextStatus('drying', null)).toBe('folding');
    expect(nextStatus('folding', null)).toBe('ready');
  });

  it('blocks at ready until a fulfilment is chosen', () => {
    expect(nextStatus('ready', null)).toBeNull();
    expect(nextStatus('ready', 'pickup')).toBe('picked_up');
    expect(nextStatus('ready', 'delivery')).toBe('for_delivery');
  });

  it('handles the post-ready branches', () => {
    expect(nextStatus('picked_up', 'pickup')).toBe('completed');
    expect(nextStatus('for_delivery', 'delivery')).toBe('out_for_delivery');
    expect(nextStatus('out_for_delivery', 'delivery')).toBe('completed');
  });

  it('returns null for terminal states', () => {
    expect(nextStatus('completed', 'pickup')).toBeNull();
    expect(nextStatus('cancelled', null)).toBeNull();
  });
});

describe('activeFor', () => {
  it('is false only for completed/cancelled', () => {
    expect(activeFor('received')).toBe(true);
    expect(activeFor('ready')).toBe(true);
    expect(activeFor('completed')).toBe(false);
    expect(activeFor('cancelled')).toBe(false);
  });
});

describe('serviceLabel', () => {
  it('maps ids to labels and falls back to the id', () => {
    expect(serviceLabel('wash_fold')).toBe('Wash & Fold');
    expect(serviceLabel('unknown')).toBe('unknown');
  });
});

describe('createOrder', () => {
  beforeEach(() => __resetMockState());

  it('allocates the first claim number of the day and writes both docs', async () => {
    const res = await createOrder(db, validInput);

    expect(res.claimNumber).toMatch(/^\d{4}-001$/);
    expect(res.id).toBeTruthy();

    const counterSet = __mockState.setCalls.find((c) => c.collection === 'counters');
    expect(counterSet?.data['seq']).toBe(1);
    expect(counterSet?.merge).toBe(true);

    const orderSet = __mockState.setCalls.find((c) => c.collection === 'orders');
    expect(orderSet?.data['status']).toBe('received');
    expect(orderSet?.data['active']).toBe(true);
    expect(orderSet?.data['source']).toBe('walk_in');
    expect((orderSet?.data['guestContact'] as { phone: string }).phone).toBe('+639171234567');
    expect((orderSet?.data['statusHistory'] as unknown[]).length).toBe(1);
  });

  it('increments an existing daily counter', async () => {
    __mockState.counterExists = true;
    __mockState.counterSeq = 13;

    const res = await createOrder(db, validInput);

    expect(res.claimNumber).toMatch(/^\d{4}-014$/);
    expect(__mockState.setCalls.find((c) => c.collection === 'counters')?.data['seq']).toBe(14);
  });

  it('rejects an invalid phone before writing anything', async () => {
    await expect(createOrder(db, { ...validInput, guestPhoneRaw: 'notaphone' })).rejects.toThrow();
    expect(__mockState.setCalls).toHaveLength(0);
  });

  it('writes a linked order when customerId is provided (guestContact still set)', async () => {
    await createOrder(db, { ...validInput, customerId: 'cust1' });
    const orderSet = __mockState.setCalls.find((c) => c.collection === 'orders');
    expect(orderSet?.data['customerId']).toBe('cust1');
    expect((orderSet?.data['guestContact'] as { name: string }).name).toBe('Ana');
  });
});

describe('linkGuestOrdersToCustomer', () => {
  // NOTE: the mock getDocs ignores the where('guestContact.phone') filter —
  // the server-side phone match is covered by live E2E, not this unit test.
  beforeEach(() => __resetMockState());

  it('links only the guest orders (customerId === null)', async () => {
    __mockState.orderDocs = [
      { id: 'o1', data: { customerId: null } },
      { id: 'o2', data: { customerId: 'someoneElse' } },
      { id: 'o3', data: { customerId: null } },
    ];

    const count = await linkGuestOrdersToCustomer(db, '0917 123 4567', 'cust1');

    expect(count).toBe(2);
    const linkedIds = __mockState.batchUpdates.map((b) => b.id).sort();
    expect(linkedIds).toEqual(['o1', 'o3']);
    for (const b of __mockState.batchUpdates) {
      expect(b.data['customerId']).toBe('cust1');
      expect(b.data['updatedAt']).toBeDefined();
    }
  });

  it('returns 0 and writes nothing when there are no guest matches', async () => {
    __mockState.orderDocs = [{ id: 'o1', data: { customerId: 'already' } }];
    await expect(linkGuestOrdersToCustomer(db, '+639171234567', 'cust1')).resolves.toBe(0);
    expect(__mockState.batchUpdates).toHaveLength(0);
  });

  it('returns 0 for an invalid phone', async () => {
    await expect(linkGuestOrdersToCustomer(db, 'notaphone', 'cust1')).resolves.toBe(0);
  });
});

describe('updateOrderStatus', () => {
  beforeEach(() => __resetMockState());

  it('advances a legal step with one updateDoc', async () => {
    await updateOrderStatus(db, 'o1', 'washing', { status: 'received', fulfilment: null });

    expect(__mockState.updateCalls).toHaveLength(1);
    const u = __mockState.updateCalls[0];
    expect(u.id).toBe('o1');
    expect(u.data['status']).toBe('washing');
    expect(u.data['active']).toBe(true);
    expect(u.data['statusHistory']).toHaveProperty('__arrayUnion');
  });

  it('flips active to false on completion', async () => {
    await updateOrderStatus(db, 'o1', 'completed', { status: 'picked_up', fulfilment: 'pickup' });
    expect(__mockState.updateCalls[0].data['active']).toBe(false);
  });

  it('rejects an illegal jump and writes nothing', async () => {
    await expect(
      updateOrderStatus(db, 'o1', 'completed', { status: 'received', fulfilment: null }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(__mockState.updateCalls).toHaveLength(0);
  });

  it('blocks advancing past ready without a fulfilment', async () => {
    await expect(
      updateOrderStatus(db, 'o1', 'picked_up', { status: 'ready', fulfilment: null }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

describe('setFulfilment / cancelOrder', () => {
  beforeEach(() => __resetMockState());

  it('sets the fulfilment', async () => {
    await setFulfilment(db, 'o1', 'pickup');
    expect(__mockState.updateCalls[0].data['fulfilment']).toBe('pickup');
  });

  it('cancels: status cancelled + active false', async () => {
    await cancelOrder(db, 'o1');
    const u = __mockState.updateCalls[0];
    expect(u.data['status']).toBe('cancelled');
    expect(u.data['active']).toBe(false);
  });
});
