import type { Timestamp } from './timestamp.model';

export type UserRole = 'customer' | 'rider' | 'admin' | 'staff';

export interface User {
  role: UserRole;
  name: string;
  /** Canonical format only: +639XXXXXXXXX */
  phone: string;
  fcmTokens: string[];
  createdAt: Timestamp;
}
