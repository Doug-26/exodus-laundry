/** Live position record written to Realtime Database at deliveries/{orderId}/riderLocation */
export interface RiderLocation {
  lat: number;
  lng: number;
  heading: number;
  timestamp: number;
}
