import type { ShopLocation } from '../models/order.model';

/**
 * Shop location, stored on every order for later delivery routing (Phase 7).
 * Placeholder = Naga City center; move to an admin-editable setting later.
 */
export const SHOP_LOCATION: ShopLocation = { lat: 13.6218, lng: 123.1948 };
