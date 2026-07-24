/**
 * PH phone numbers arrive in multiple formats from the real world:
 *   0917xxxxxxx   (local)
 *   63917xxxxxxx  (without +)
 *   +63917xxxxxxx (canonical)
 *   With spaces, dashes, or dots as separators
 *
 * Only the canonical +639XXXXXXXXX form is stored in Firestore.
 * Querying by any other form silently returns no matches — §12 gotcha #3.
 */

const PH_CANONICAL_RE = /^\+639\d{9}$/;

/** Strip all whitespace, dashes, dots, and parentheses from a raw string. */
function stripFormatting(raw: string): string {
  return raw.replace(/[\s\-.() ]/g, '');
}

/**
 * Normalise any real-world PH mobile number to +639XXXXXXXXX.
 * Throws if the input cannot be resolved to a valid PH mobile number.
 */
export function toCanonical(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`Invalid phone number: ${JSON.stringify(raw)}`);
  }

  const stripped = stripFormatting(raw);

  let normalized: string;

  if (stripped.startsWith('+63')) {
    normalized = stripped;
  } else if (stripped.startsWith('63')) {
    normalized = '+' + stripped;
  } else if (stripped.startsWith('0')) {
    normalized = '+63' + stripped.slice(1);
  } else {
    throw new Error(`Unrecognised PH phone format: "${raw}"`);
  }

  if (!isValidPhPhone(normalized)) {
    throw new Error(`Not a valid PH mobile number: "${raw}" → "${normalized}"`);
  }

  return normalized;
}

/**
 * Returns true only for canonical +639XXXXXXXXX (10 digits after +63).
 * Does not accept landlines, 1xx numbers, or international non-PH numbers.
 */
export function isValidPhPhone(value: unknown): value is string {
  return typeof value === 'string' && PH_CANONICAL_RE.test(value);
}
