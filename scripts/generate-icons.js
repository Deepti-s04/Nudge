import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicIconDir = path.resolve(rootDir, 'public', 'icon');

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgbaBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None
    rgbaBuffer.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  
  const idatChunk = makeChunk('IDAT', zlib.deflateSync(rawData));
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const nx = ax + t * abx;
  const ny = ay + t * aby;
  return Math.hypot(px - nx, py - ny);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const subSamples = 4;
  const invSub = 1 / subSamples;
  const invTotal = 1 / (subSamples * subSamples);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      for (let sy = 0; sy < subSamples; sy++) {
        for (let sx = 0; sx < subSamples; sx++) {
          const subX = x + (sx + 0.5) * invSub;
          const subY = y + (sy + 0.5) * invSub;

          // Normalize to 128x128 virtual canvas
          const nx = (subX / size) * 128;
          const ny = (subY / size) * 128;

          // Squircle SDF (box half-size 58 with corner radius 26)
          const qx = Math.abs(nx - 64) - 32;
          const qy = Math.abs(ny - 64) - 32;
          const distSquircle = Math.hypot(Math.max(0, qx), Math.max(0, qy)) + Math.min(0, Math.max(qx, qy)) - 26;

          if (distSquircle > 0.5) {
            // Outside
            continue;
          }

          // Squircle background and border
          let pr = 24;
          let pg = 24;
          let pb = 27;
          let pa = 255;

          if (distSquircle > -1.5) {
            // Subtle 1.5px border #27272a
            pr = 39;
            pg = 39;
            pb = 42;
          }

          // Letter N segments (left, diagonal, right)
          const dLeft = distToSegment(nx, ny, 38, 90, 38, 38);
          const dDiag = distToSegment(nx, ny, 38, 38, 90, 90);
          const dRight = distToSegment(nx, ny, 90, 90, 90, 38);
          const dN = Math.min(dLeft, dDiag, dRight);

          // Focus Dot
          const dDot = Math.hypot(nx - 72, ny - 49);

          const strokeRadius = size <= 16 ? 6.2 : 5.4;
          const dotRadius = size <= 16 ? 7.5 : 7.0;

          if (dN <= strokeRadius || dDot <= dotRadius) {
            // Soft subtle Indigo/Periwinkle #818cf8
            pr = 129;
            pg = 140;
            pb = 248;
          }

          // Anti-alias edge of squircle
          if (distSquircle > -0.5) {
            const alphaFactor = Math.max(0, Math.min(1, (0.5 - distSquircle)));
            pa = Math.round(255 * alphaFactor);
          }

          rSum += pr * (pa / 255);
          gSum += pg * (pa / 255);
          bSum += pb * (pa / 255);
          aSum += pa;
        }
      }

      const pixelIdx = (y * size + x) * 4;
      const finalA = Math.round(aSum * invTotal);
      if (finalA > 0) {
        rgba[pixelIdx] = Math.round((rSum * invTotal) / (finalA / 255));
        rgba[pixelIdx + 1] = Math.round((gSum * invTotal) / (finalA / 255));
        rgba[pixelIdx + 2] = Math.round((bSum * invTotal) / (finalA / 255));
        rgba[pixelIdx + 3] = finalA;
      } else {
        rgba[pixelIdx] = 0;
        rgba[pixelIdx + 1] = 0;
        rgba[pixelIdx + 2] = 0;
        rgba[pixelIdx + 3] = 0;
      }
    }
  }

  return encodePNG(size, size, rgba);
}

export function generateAllIcons() {
  const targetDirs = [
    publicIconDir,
    path.resolve(rootDir, '.output', 'chrome-mv3', 'icon'),
    path.resolve(rootDir, '.output', 'chrome-mv3-dev', 'icon'),
  ];

  const sizes = [16, 32, 48, 96, 128];
  const renderedIcons = new Map();
  for (const s of sizes) {
    renderedIcons.set(s, renderIcon(s));
  }

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        continue;
      }
    }
    for (const [s, pngBuffer] of renderedIcons) {
      try {
        fs.writeFileSync(path.resolve(dir, `${s}.png`), pngBuffer);
      } catch (err) {
        // ignore if directory is not ready
      }
    }
  }
}

// Run if directly executed
generateAllIcons();
