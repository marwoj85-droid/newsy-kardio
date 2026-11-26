// Generuje ikony PNG aplikacji (czerwone tło, białe serce z linią EKG) bez zewnętrznych bibliotek.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y); const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// odległość punktu od odcinka
const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
// linia EKG w układzie serca (-1.3..1.3)
const ecg = [[-1.3, 0.05], [-0.45, 0.05], [-0.25, -0.35], [0.0, 0.55], [0.2, -0.15], [0.32, 0.05], [1.3, 0.05]];

function draw(size, scale) {
  const SS = 4; // antyaliasing
  const RED = [179, 38, 30], WHITE = [255, 255, 255];
  return png(size, (x, y) => {
    let heart = 0, line = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = ((x + (sx + 0.5) / SS) / size - 0.5) * 2 / scale * 1.35;
      const v = -((y + (sy + 0.5) / SS) / size - 0.5) * 2 / scale * 1.35 + 0.1;
      const f = Math.pow(u * u + v * v - 1, 3) - u * u * v * v * v;
      const inH = f <= 0;
      if (inH) heart++;
      let d = 1e9; for (let i = 0; i < ecg.length - 1; i++) d = Math.min(d, segDist(u, v, ...ecg[i], ...ecg[i + 1]));
      if (inH && d < 0.075) line++;
    }
    const n = SS * SS, h = heart / n, l = line / n;
    // tło czerwone, serce białe, linia EKG czerwona wewnątrz serca
    const mix = (a, b, t) => Math.round(a + (b - a) * t);
    let c = RED.map((r, i) => mix(r, WHITE[i], h));
    c = c.map((v, i) => mix(v, RED[i], l));
    return [...c, 255];
  });
}

for (const [name, size, scale] of [['icon-192.png', 192, 0.62], ['icon-512.png', 512, 0.62], ['maskable-512.png', 512, 0.5]]) {
  fs.writeFileSync(path.join(OUT, name), draw(size, scale));
  console.log('zapisano', name);
}
