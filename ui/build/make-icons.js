/**
 * Rasterises the app icon to PNG without any dependency: a tiny PNG encoder plus a software
 * renderer for the same geometry as icon.svg (rounded dark square, cyan ring with a gap, dot).
 *   node ui/build/make-icons.js
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export class PngEncoder {
  /** @type {number[]} */
  static #table = PngEncoder.#crcTable();

  static #crcTable() {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t.push(c >>> 0);
    }
    return t;
  }

  /** @param {Buffer} buf */
  static crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = PngEncoder.#table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /**
   * @param {string} type
   * @param {Buffer} data
   */
  static chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(PngEncoder.crc32(td));
    return Buffer.concat([len, td, crc]);
  }

  /**
   * @param {number} size
   * @param {Uint8Array} rgba  size*size*4 bytes
   */
  static encode(size, rgba) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
      raw[y * (size * 4 + 1)] = 0;
      raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      PngEncoder.chunk('IHDR', ihdr), PngEncoder.chunk('IDAT', deflateSync(raw)), PngEncoder.chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

/** Draws the icon with 4×4 supersampling. */
export class IconRenderer {
  /**
   * @param {number} size
   * @param {{ maskable?: boolean }} [o]
   */
  static render(size, { maskable = false } = {}) {
    const out = new Uint8Array(size * size * 4);
    const ss = 4;
    const bg = [0x0f, 0x17, 0x2a];
    const fg = [0x38, 0xbd, 0xf8];
    const pad = maskable ? 0 : size * 0.0625;
    const radius = maskable ? 0 : size * 0.22;
    const cx = size / 2;
    const ring = maskable ? size * 0.2 : size * 0.25;
    const stroke = maskable ? size * 0.078 : size * 0.094;
    const dot = maskable ? size * 0.0625 : size * 0.078;
    const gapStart = -Math.PI / 2 + Math.PI * 2 * 0.72; // 72% arc drawn, gap at the top-left like the SVG
    const gapEnd = -Math.PI / 2 + Math.PI * 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = x + (sx + 0.5) / ss;
        const py = y + (sy + 0.5) / ss;
        // rounded square
        const qx = Math.max(Math.abs(px - cx) - (cx - pad - radius), 0);
        const qy = Math.max(Math.abs(py - cx) - (cx - pad - radius), 0);
        const inside = Math.hypot(qx, qy) <= radius;
        if (!inside) continue;
        let c = bg;
        const d = Math.hypot(px - cx, py - cx);
        const ang = Math.atan2(py - cx, px - cx);
        const normalised = ((ang + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI / 2;
        const inGap = normalised >= gapStart && normalised < gapEnd;
        if (Math.abs(d - ring) <= stroke / 2 && !inGap) c = fg;
        if (d <= dot) c = fg;
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      const cov = a / (n * 255);
      out[i] = cov ? r / (a / 255) : 0;
      out[i + 1] = cov ? g / (a / 255) : 0;
      out[i + 2] = cov ? b / (a / 255) : 0;
      out[i + 3] = a / n;
    }
    return out;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1])) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
  writeFileSync(join(dir, 'apple-touch-icon.png'), PngEncoder.encode(180, IconRenderer.render(180, { maskable: true })));
  writeFileSync(join(dir, 'icon-512.png'), PngEncoder.encode(512, IconRenderer.render(512, { maskable: true })));
  console.log('icons written');
}
