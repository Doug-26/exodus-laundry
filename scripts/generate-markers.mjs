/**
 * Generates the three live-tracking map markers as PNGs (Phase 8).
 * Native @capacitor/google-maps markers need raster icons (no SVG), so we draw
 * distinct coloured discs with a white glyph and encode them with Node's zlib —
 * no image libraries required.
 *
 *   Shop        → teal disc + house glyph
 *   Destination → red disc  + flag glyph
 *   Rider       → blue disc + navigation arrow (the moving one)
 *
 * Run: node scripts/generate-markers.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZE = 96;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../apps/mobile/src/assets/markers');

// ── tiny RGBA canvas ─────────────────────────────────────────────────────────
const makeCanvas = () => new Uint8Array(SIZE * SIZE * 4); // transparent

const setPx = (buf, x, y, [r, g, b], a = 255) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const na = a / 255;
  const oa = buf[i + 3] / 255;
  const outA = na + oa * (1 - na);
  if (outA === 0) return;
  buf[i] = Math.round((r * na + buf[i] * oa * (1 - na)) / outA);
  buf[i + 1] = Math.round((g * na + buf[i + 1] * oa * (1 - na)) / outA);
  buf[i + 2] = Math.round((b * na + buf[i + 2] * oa * (1 - na)) / outA);
  buf[i + 3] = Math.round(outA * 255);
};

// Filled disc with soft (anti-aliased) edge.
const disc = (buf, cx, cy, radius, color, a = 255) => {
  const r0 = radius - 1;
  const r1 = radius;
  for (let y = Math.floor(cy - r1 - 1); y <= Math.ceil(cy + r1 + 1); y++) {
    for (let x = Math.floor(cx - r1 - 1); x <= Math.ceil(cx + r1 + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r0) setPx(buf, x, y, color, a);
      else if (d < r1) setPx(buf, x, y, color, a * (r1 - d));
    }
  }
};

const rect = (buf, x0, y0, w, h, color) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(buf, x, y, color);
};

// Filled triangle via barycentric test.
const tri = (buf, p0, p1, p2, color) => {
  const minX = Math.floor(Math.min(p0[0], p1[0], p2[0]));
  const maxX = Math.ceil(Math.max(p0[0], p1[0], p2[0]));
  const minY = Math.floor(Math.min(p0[1], p1[1], p2[1]));
  const maxY = Math.ceil(Math.max(p0[1], p1[1], p2[1]));
  const area = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const A = area(p0, p1, p2);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = [x + 0.5, y + 0.5];
      const w0 = area(p1, p2, p) / A;
      const w1 = area(p2, p0, p) / A;
      const w2 = area(p0, p1, p) / A;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPx(buf, x, y, color);
    }
  }
};

const WHITE = [255, 255, 255];

// ── glyphs (drawn white, centred around the disc centre 48,44) ───────────────
const houseGlyph = (buf) => {
  // roof
  tri(buf, [30, 46], [48, 30], [66, 46], WHITE);
  // body
  rect(buf, 36, 46, 24, 20, WHITE);
  // door (cut back to teal-ish via transparency punch → use disc colour hole)
};

const flagGlyph = (buf, holeColor) => {
  rect(buf, 36, 28, 4, 40, WHITE); // pole
  rect(buf, 40, 30, 26, 18, WHITE); // flag
  // checker cut-outs
  rect(buf, 44, 30, 7, 9, holeColor);
  rect(buf, 58, 30, 7, 9, holeColor);
  rect(buf, 51, 39, 7, 9, holeColor);
};

const arrowGlyph = (buf, holeColor) => {
  // upward navigation chevron
  tri(buf, [48, 28], [64, 64], [48, 54], WHITE);
  tri(buf, [48, 28], [48, 54], [32, 64], WHITE);
  tri(buf, [48, 54], [58, 60], [38, 60], holeColor);
};

// ── compose one marker ───────────────────────────────────────────────────────
const marker = (fill, glyph) => {
  const buf = makeCanvas();
  disc(buf, 48, 44, 40, WHITE); // white ring
  disc(buf, 48, 44, 35, fill); // coloured body
  glyph(buf, fill);
  return buf;
};

// ── PNG encode (RGBA, filter 0) ──────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
const encodePng = (rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // raw with per-row filter byte 0
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ── write files ──────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const icons = {
  shop: marker([14, 116, 144], houseGlyph), // #0e7490 teal
  destination: marker([220, 38, 38], flagGlyph), // #dc2626 red
  rider: marker([37, 99, 235], arrowGlyph), // #2563eb blue
};
for (const [name, buf] of Object.entries(icons)) {
  writeFileSync(join(OUT, `${name}.png`), encodePng(buf));
  console.log(`wrote ${name}.png`);
}
