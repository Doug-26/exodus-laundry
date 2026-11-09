// Generates the static QR SVG used on the public app download page.
// The payload is the stable Firebase Hosting download page. Phone cameras
// consistently open a web page, whose primary button downloads the APK.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const output = join(dirname(fileURLToPath(import.meta.url)), '../apps/dashboard/public/download-qr.svg');
const payload = Buffer.from('https://exodus-laundry.web.app/download.html', 'utf8');
const version = 4;
const size = 17 + version * 4;
const dataCodewords = 80;
const eccCodewords = 20;
const matrix = Array.from({ length: size }, () => Array(size).fill(false));
const reserved = Array.from({ length: size }, () => Array(size).fill(false));

function setFunction(x, y, dark) {
  if (x >= 0 && y >= 0 && x < size && y < size) {
    matrix[y][x] = dark;
    reserved[y][x] = true;
  }
}

function addFinder(x, y) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      setFunction(x + dx, y + dy, distance !== 2 && distance !== 4);
    }
  }
}

function addAlignment(cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function appendBits(target, value, length) {
  for (let i = length - 1; i >= 0; i--) target.push((value >>> i) & 1);
}

function gfMultiply(x, y) {
  let product = 0;
  for (let i = 7; i >= 0; i--) {
    product = (product << 1) ^ ((product >>> 7) * 0x11d);
    product ^= ((y >>> i) & 1) * x;
  }
  return product;
}

function reedSolomon(data, degree) {
  let generator = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = Array(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j++) {
      next[j] ^= generator[j];
      next[j + 1] ^= gfMultiply(generator[j], root);
    }
    generator = next;
    root = gfMultiply(root, 2);
  }

  const remainder = Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift();
    remainder.push(0);
    for (let i = 0; i < degree; i++) remainder[i] ^= gfMultiply(generator[i + 1], factor);
  }
  return remainder;
}

if (payload.length > 78) throw new Error('The URL is too long for a version 4-L QR code.');

// Version 4-L supports up to 78 byte-mode payload bytes in 80 data codewords.
const bits = [];
appendBits(bits, 0b0100, 4); // byte mode
appendBits(bits, payload.length, 8);
for (const byte of payload) appendBits(bits, byte, 8);
for (let i = 0; i < Math.min(4, dataCodewords * 8 - bits.length); i++) bits.push(0);
while (bits.length % 8 !== 0) bits.push(0);

const data = [];
for (let i = 0; i < bits.length; i += 8) {
  data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
}
for (let pad = 0; data.length < dataCodewords; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);
const codewords = data.concat(reedSolomon(data, eccCodewords));

// Finder, timing, alignment, and fixed dark modules.
addFinder(0, 0);
addFinder(size - 7, 0);
addFinder(0, size - 7);
addAlignment(size - 7, size - 7);
for (let i = 8; i < size - 8; i++) {
  setFunction(6, i, i % 2 === 0);
  setFunction(i, 6, i % 2 === 0);
}
setFunction(8, size - 8, true);

// Place data in the standard two-column zigzag. Mask 0 is applied below.
let bitIndex = 0;
for (let right = size - 1; right >= 1; right -= 2) {
  if (right === 6) right = 5;
  for (let vert = 0; vert < size; vert++) {
    const upward = ((right + 1) & 2) === 0;
    const y = upward ? size - 1 - vert : vert;
    for (let offset = 0; offset < 2; offset++) {
      const x = right - offset;
      if (reserved[y][x]) continue;
      const bit = bitIndex < codewords.length * 8
        ? (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1
        : 0;
      matrix[y][x] = Boolean(bit ^ (((x + y) & 1) === 0));
      bitIndex++;
    }
  }
}

// Error correction level L plus mask 0 (format information BCH encoded).
const formatData = 0b01000;
let remainder = formatData << 10;
for (let i = 14; i >= 10; i--) {
  if (((remainder >>> i) & 1) !== 0) remainder ^= 0x537 << (i - 10);
}
const format = ((formatData << 10) | remainder) ^ 0x5412;
for (let i = 0; i <= 5; i++) setFunction(8, i, ((format >>> i) & 1) !== 0);
setFunction(8, 7, ((format >>> 6) & 1) !== 0);
setFunction(8, 8, ((format >>> 7) & 1) !== 0);
setFunction(7, 8, ((format >>> 8) & 1) !== 0);
for (let i = 9; i < 15; i++) setFunction(14 - i, 8, ((format >>> i) & 1) !== 0);
for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, ((format >>> i) & 1) !== 0);
for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, ((format >>> i) & 1) !== 0);

const quietZone = 4;
const viewSize = size + quietZone * 2;
const path = [];
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    if (matrix[y][x]) path.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
  }
}

writeFileSync(output,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" role="img" aria-labelledby="title desc" shape-rendering="crispEdges">` +
  `<title id="title">QR code to download the Exodus Laundry Android app</title>` +
  `<desc id="desc">Scans to the Exodus Laundry Android app download page</desc>` +
  `<rect width="100%" height="100%" fill="#fff"/><path d="${path.join('')}" fill="#102c35"/></svg>`,
  'utf8',
);
console.log(`Generated ${output} for ${payload.toString('utf8')}`);
