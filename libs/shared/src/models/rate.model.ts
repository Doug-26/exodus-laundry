/** Phase 2 — rate-based pricing. Not used in MVP. */
export type RateUnit = 'per_kg' | 'flat';

export interface Rate {
  service: string;
  unit: RateUnit;
  amount: number;
  active: boolean;
}
