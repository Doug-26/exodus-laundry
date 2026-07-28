// Models
export type { Timestamp } from './models/timestamp.model';
export type { User, UserRole } from './models/user.model';
export type {
  Order,
  OrderStatus,
  Fulfilment,
  OrderSource,
  GuestContact,
  Destination,
  ShopLocation,
  RouteCache,
} from './models/order.model';
export type { Rate, RateUnit } from './models/rate.model';
export type { RiderLocation } from './models/rider-location.model';

// Utils
export { toCanonical, isValidPhPhone } from './utils/phone';

// Services
export { initializeFirebase, getFirebaseServices } from './services/firebase';
export type { FirebaseConfig, FirebaseServices } from './services/firebase';
export {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  sendReset,
  onAuthChange,
  getCurrentUser,
} from './services/auth';
export type { FirebaseUser, UserCredential, Unsubscribe } from './services/auth';
export {
  createUserProfile,
  getUserProfile,
  findUserByPhone,
  PhoneTakenError,
} from './services/users';
export type { CreateUserProfileInput } from './services/users';
