/**
 * Shape-compatible with firebase/firestore Timestamp.
 * Avoids importing the firebase SDK in the shared data-model layer.
 * Phase 1 wires in the real FirebaseTimestamp via the service layer.
 */
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}
