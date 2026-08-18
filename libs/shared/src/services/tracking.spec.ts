import {
  seedDeliveryMeta,
  writeRiderLocation,
  subscribeRiderLocation,
  clearDelivery,
} from './tracking';
import type { RiderLocation } from '../models/rider-location.model';
import { __mockState, __resetMockState } from '../../__mocks__/firebase-database';

// The Database instance is never used by the mock; cast a stub to the param type.
const db = {} as Parameters<typeof writeRiderLocation>[0];

describe('tracking RTDB helpers', () => {
  beforeEach(() => __resetMockState());

  it('seeds meta at deliveries/{id}/meta with rider + customer uids', async () => {
    await seedDeliveryMeta(db, 'ord1', { riderId: 'r1', customerId: 'c1' });

    expect(__mockState.setCalls).toEqual([
      { path: 'deliveries/ord1/meta', value: { riderId: 'r1', customerId: 'c1' } },
    ]);
  });

  it('writes the rider location at deliveries/{id}/riderLocation', async () => {
    const loc: RiderLocation = { lat: 13.65, lng: 123.25, heading: 90, timestamp: 111 };
    await writeRiderLocation(db, 'ord2', loc);

    expect(__mockState.setCalls).toEqual([{ path: 'deliveries/ord2/riderLocation', value: loc }]);
  });

  it('clears the whole delivery node at deliveries/{id}', async () => {
    await clearDelivery(db, 'ord3');

    expect(__mockState.removePaths).toEqual(['deliveries/ord3']);
  });

  it('delivers the current location snapshot to the subscriber', () => {
    const loc: RiderLocation = { lat: 1, lng: 2, heading: 0, timestamp: 5 };
    __mockState.nextValue = loc;
    const received: (RiderLocation | null)[] = [];

    const unsub = subscribeRiderLocation(db, 'ord4', (l) => received.push(l));

    expect(received).toEqual([loc]);
    expect(typeof unsub).toBe('function');
  });

  it('maps an absent snapshot to null', () => {
    __mockState.nextValue = null;
    const received: (RiderLocation | null)[] = [];

    subscribeRiderLocation(db, 'ord5', (l) => received.push(l));

    expect(received).toEqual([null]);
  });
});
