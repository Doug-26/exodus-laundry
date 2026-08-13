/**
 * Google "encoded polyline algorithm" decoder.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * The Routes API returns the delivery route as an encoded polyline string;
 * decode it to a list of {lat,lng} points to draw on @capacitor/google-maps.
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export function decodePolyline(encoded: string): LatLngPoint[] {
  const points: LatLngPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    lat += decodeValue();
    lng += decodeValue();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;

  /** Decode one signed value (a lat or lng delta) starting at `index`. */
  function decodeValue(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63; // chars are offset by 63
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20); // continuation bit set → more chunks follow
    // Least-significant bit is the sign flag (zig-zag encoding).
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
