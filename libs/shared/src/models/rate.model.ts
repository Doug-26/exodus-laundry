/**
 * Phase 10 — rate-based pricing. One rate per service (doc id = service).
 *
 * Model: a base price covers up to `baseKg`, then `perKg` is charged for each kg
 * above it. Covers all shapes:
 *   - Base + overage (wash & fold): baseKg 5, baseAmount 180, perKg 40
 *   - Flat per order (comforter):   baseKg 0, baseAmount 250, perKg 0
 *   - Pure per-kg:                  baseKg 0, baseAmount 0,   perKg 35
 */
export interface Rate {
  service: string;
  /** Weight (kg) included in the base price; 0 = none. */
  baseKg: number;
  /** ₱ charged for weight up to baseKg (also the effective minimum). */
  baseAmount: number;
  /** ₱ per kg charged above baseKg; 0 = flat (weight ignored). */
  perKg: number;
  active: boolean;
}
