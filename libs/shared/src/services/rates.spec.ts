import { computePrice } from './rates';
import type { Rate } from '../models/rate.model';

// Exodus wash & fold: ₱180 covers up to 5kg, then ₱40 per kg above.
const washFold = (over: Partial<Rate> = {}): Rate => ({
  service: 'wash_fold',
  baseKg: 5,
  baseAmount: 180,
  perKg: 40,
  active: true,
  ...over,
});

describe('computePrice', () => {
  it('charges the base price at or below the included weight', () => {
    expect(computePrice(washFold(), 3)).toBe(180);
    expect(computePrice(washFold(), 5)).toBe(180);
  });

  it('adds perKg for weight above the base', () => {
    expect(computePrice(washFold(), 6)).toBe(220); // 180 + 1×40
    expect(computePrice(washFold(), 7)).toBe(260); // 180 + 2×40
    expect(computePrice(washFold(), 10)).toBe(380); // 180 + 5×40
  });

  it('rounds fractional overage to the nearest peso', () => {
    expect(computePrice(washFold({ perKg: 35 }), 6.5)).toBe(233); // 180 + 1.5×35 = 232.5 → 233
  });

  it('flat (perKg 0) returns the base amount regardless of weight', () => {
    const comforter: Rate = { service: 'comforter', baseKg: 0, baseAmount: 250, perKg: 0, active: true };
    expect(computePrice(comforter, null)).toBe(250);
    expect(computePrice(comforter, 8)).toBe(250);
  });

  it('pure per-kg (no base) multiplies weight', () => {
    const pure: Rate = { service: 'x', baseKg: 0, baseAmount: 0, perKg: 30, active: true };
    expect(computePrice(pure, 4)).toBe(120);
  });

  it('returns null when a per-kg rate has no weight (fall back to manual)', () => {
    expect(computePrice(washFold(), null)).toBeNull();
    expect(computePrice(washFold(), 0)).toBeNull();
  });

  it('returns null for a missing or inactive rate', () => {
    expect(computePrice(null, 6)).toBeNull();
    expect(computePrice(washFold({ active: false }), 6)).toBeNull();
  });
});
