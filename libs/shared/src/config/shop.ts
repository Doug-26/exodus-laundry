import type { ShopLocation } from '../models/order.model';

/**
 * Shop location, stored on every order for later delivery routing (Phase 7).
 * Exodus Laundry Services — Block 55, Lot 5, Urban, Pacol, Naga City.
 * (Move to an admin-editable setting later.)
 */
export const SHOP_LOCATION: ShopLocation = { lat: 13.655972, lng: 123.251262 };
