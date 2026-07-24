import { toCanonical, isValidPhPhone } from './phone';

const CANONICAL = '+639171234567';

describe('toCanonical', () => {
  describe('valid formats', () => {
    it('normalises local 0917... format', () => {
      expect(toCanonical('09171234567')).toBe(CANONICAL);
    });

    it('normalises +63917... format (passthrough)', () => {
      expect(toCanonical('+639171234567')).toBe(CANONICAL);
    });

    it('normalises 63917... format (no leading +)', () => {
      expect(toCanonical('639171234567')).toBe(CANONICAL);
    });
  });

  describe('formatted inputs (spaces, dashes)', () => {
    it('strips spaces from +63 917 123 4567', () => {
      expect(toCanonical('+63 917 123 4567')).toBe(CANONICAL);
    });

    it('strips dashes from 0917-123-4567', () => {
      expect(toCanonical('0917-123-4567')).toBe(CANONICAL);
    });

    it('strips dots from 0917.123.4567', () => {
      expect(toCanonical('0917.123.4567')).toBe(CANONICAL);
    });

    it('strips mixed separators from +63-917 123-4567', () => {
      expect(toCanonical('+63-917 123-4567')).toBe(CANONICAL);
    });
  });

  describe('invalid inputs', () => {
    it('throws for empty string', () => {
      expect(() => toCanonical('')).toThrow();
    });

    it('throws for whitespace-only string', () => {
      expect(() => toCanonical('   ')).toThrow();
    });

    it('throws for null', () => {
      expect(() => toCanonical(null)).toThrow();
    });

    it('throws for undefined', () => {
      expect(() => toCanonical(undefined)).toThrow();
    });

    it('throws for non-string number', () => {
      expect(() => toCanonical(9171234567)).toThrow();
    });

    it('throws for too short a number', () => {
      expect(() => toCanonical('091712345')).toThrow();
    });

    it('throws for too long a number', () => {
      expect(() => toCanonical('091712345678')).toThrow();
    });

    it('throws for non-PH international number', () => {
      expect(() => toCanonical('+12025551234')).toThrow();
    });

    it('throws for completely non-numeric string', () => {
      expect(() => toCanonical('notaphone')).toThrow();
    });
  });
});

describe('isValidPhPhone', () => {
  it('accepts canonical +639XXXXXXXXX', () => {
    expect(isValidPhPhone('+639171234567')).toBe(true);
  });

  it('rejects 0917... (local format)', () => {
    expect(isValidPhPhone('09171234567')).toBe(false);
  });

  it('rejects 63917... (no + prefix)', () => {
    expect(isValidPhPhone('639171234567')).toBe(false);
  });

  it('rejects number with spaces', () => {
    expect(isValidPhPhone('+63 917 123 4567')).toBe(false);
  });

  it('rejects too-short canonical', () => {
    expect(isValidPhPhone('+63917123456')).toBe(false);
  });

  it('rejects too-long canonical', () => {
    expect(isValidPhPhone('+6391712345678')).toBe(false);
  });

  it('rejects non-string', () => {
    expect(isValidPhPhone(639171234567)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidPhPhone(null)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPhPhone('')).toBe(false);
  });
});
