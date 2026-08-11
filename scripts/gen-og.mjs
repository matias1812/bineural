// Genera public/og.png (1200×630) sin dependencias: PNG + zlib de Node.
// Uso: node scripts/gen-og.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 1200;
const H = 630;
const px = new Float64Array(W * H * 4);

function blend(x, y, r, g, b, a) {
  if (a <= 0) return;
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 4;
  const a0 = 1 - a;
  px[i] = px[i] * a0 + r * a;
  px[i + 1] = px[i + 1] * a0 + g * a;
  px[i + 2] = px[i + 2] * a0 + b * a;
  px[i + 3] = 255;
}

function circle(cx, cy, r, inner, outer, highlight = 0, hlX = 0, hlY = 0) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      // Degradado radial: interior → borde.
      const t = d / r;
      let col = inner.map((c, i) => c + (outer[i] - c) * t);
      // Brillo especular (luz arriba-izquierda).
      const hs = Math.hypot(x - (cx + hlX), y - (cy + hlY));
      if (hs < r * 0.7) {
        const k = 1 - hs / (r * 0.7);
        col = col.map((c) => c + (255 - c) * k * highlight);
      }
      blend(x, y, col[0], col[1], col[2], 1);
    }
  }
}

function ring(cx, cy, r, color, alpha) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - r) <= 1.2) blend(x, y, ...color, alpha);
    }
  }
}

// ---------------------------------------------------------------- Fondo
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    const r = 8 + t * 5;
    const g = 9 + t * 6;
    const b = 20 + t * 14;
    px[(y * W + x) * 4] = r;
    px[(y * W + x) * 4 + 1] = g;
    px[(y * W + x) * 4 + 2] = b;
    px[(y * W + x) * 4 + 3] = 255;
  }
}

// Resplandores de color
for (let i = 0; i < W * H; i += 4) {
  const x = i % W;
  const y = Math.floor(i / W) | 0;
  const d1 = Math.hypot(x - 600, y - 300) / 620;
  if (d1 < 1) {
    const k = 1 - d1;
    blend(x, y, 167, 139, 250, 0.22 * k);
  }
  const d2 = Math.hypot(x - 180, y - 500) / 700;
  if (d2 < 1) {
    const k = 1 - d2;
    blend(x, y, 96, 165, 250, 0.14 * k);
  }
  const d3 = Math.hypot(x - 1020, y - 500) / 700;
  if (d3 < 1) {
    const k = 1 - d3;
    blend(x, y, 244, 114, 182, 0.12 * k);
  }
}

// Estrellas (LCG determinista)
let seed = 42;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
}
for (let i = 0; i < 220; i++) {
  const x = rnd() * W;
  const y = rnd() * (H - 220);
  const r = 0.4 + rnd() * 1.2;
  const a = 0.15 + rnd() * 0.5;
  const tint = rnd();
  const col = tint < 0.7 ? [255, 255, 255] : tint < 0.85 ? [147, 197, 253] : [196, 181, 253];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.hypot(dx, dy) <= r) blend(x + dx, y + dy, ...col, a);
    }
  }
}

// ---------------------------------------------------------------- Gotas
const drops = [
  { x: 300, color: [96, 165, 250] }, // azul
  { x: 600, color: [167, 139, 250] }, // violeta
  { x: 900, color: [244, 114, 182] }, // rosa
];
const cy = 300;
const R = 95;

// Anillos expansivos alrededor de cada gota
for (const d of drops) {
  for (let k = 1; k <= 3; k++) {
    ring(d.x, cy, R + k * 16, d.color, 0.1 - k * 0.02);
  }
}

// Onda senoidal que conecta las tres gotas
for (let x = drops[0].x + R; x <= drops[2].x - R; x += 0.5) {
  const y = cy + Math.sin(((x - drops[0].x) / (drops[2].x - drops[0].x)) * Math.PI * 3) * 24;
  blend(x, y, 238, 240, 255, 0.28);
  blend(x, y + 1, 238, 240, 255, 0.18);
}

for (const d of drops) {
  // Cuerpo con degradado y brillo especular
  const inner = d.color.map((c) => Math.min(255, c + 60));
  const outer = d.color.map((c) => Math.max(0, c * 0.55));
  circle(d.x, cy, R, inner, outer, 0.55, -R * 0.32, -R * 0.36);
  // Núcleo brillante
  const core = d.color.map((c) => Math.min(255, c + 110));
  circle(d.x, cy, R * 0.34, core, d.color, 0.5, 0, -R * 0.1);
}

// ---------------------------------------------------------------- Fuente bitmap 5×7
const FONT = {
  A: [' .##. ', '#...# ', '#...# ', '##### ', '#...# ', '#...# ', '#...# '],
  B: ['####. ', '#...# ', '#...# ', '####. ', '#...# ', '#...# ', '####. '],
  C: [' .### ', '#...# ', '#.... ', '#.... ', '#.... ', '#...# ', ' .### '],
  D: ['####. ', '#...# ', '#...# ', '#...# ', '#...# ', '#...# ', '####. '],
  E: ['##### ', '#.... ', '#.... ', '####. ', '#.... ', '#.... ', '##### '],
  I: ['##### ', '..#.. ', '..#.. ', '..#.. ', '..#.. ', '..#.. ', '##### '],
  J: ['..### ', '...#. ', '...#. ', '...#. ', '...#. ', '#..#. ', '.##.. '],
  L: ['#.... ', '#.... ', '#.... ', '#.... ', '#.... ', '#.... ', '##### '],
  M: ['#...# ', '##.## ', '#.#.# ', '#.#.# ', '#...# ', '#...# ', '#...# '],
  N: ['#...# ', '##..# ', '#.#.# ', '#..## ', '#...# ', '#...# ', '#...# '],
  O: [' .### ', '#...# ', '#...# ', '#...# ', '#...# ', '#...# ', ' .### '],
  R: ['####. ', '#...# ', '#...# ', '####. ', '#.#.. ', '#..#. ', '#...# '],
  S: [' .####', '#.... ', '#.... ', ' .### ', '....# ', '....# ', '####. '],
  T: ['##### ', '..#.. ', '..#.. ', '..#.. ', '..#.. ', '..#.. ', '..#.. '],
  U: ['#...# ', '#...# ', '#...# ', '#...# ', '#...# ', '#...# ', ' .### '],
  DOT: ['..... ', '..... ', '..##. ', '..##. ', '..... ', '..... ', '..... '],
  SP: ['..... ', '..... ', '..... ', '..... ', '..... ', '..... ', '..... '],
};

function drawText(text, cx, cy, scale, color, alpha = 1, glow = true) {
  const cells = text.split('').map((ch) => (ch === '·' ? 'DOT' : ch === ' ' ? 'SP' : ch));
  const cellW = 6 * scale; // 5 columnas + 1 de separación
  const totalW = cells.length * cellW;
  let x0 = cx - totalW / 2;
  const layers = glow
    ? [
        [0, -scale * 0.5, alpha * 0.35],
        [0, scale * 0.5, alpha * 0.35],
        [-scale * 0.5, 0, alpha * 0.35],
        [scale * 0.5, 0, alpha * 0.35],
        [0, 0, alpha],
      ]
    : [[0, 0, alpha]];
  for (const [offX, offY, a] of layers) {
    let cell = 0;
    for (const ch of cells) {
      const glyph = FONT[ch];
      for (let row = 0; row < 7; row++) {
        const line = glyph[row];
        for (let col = 0; col < 5; col++) {
          if (line[col] !== '#') continue;
          const px0 = x0 + cell * cellW + col * scale + offX;
          const py0 = cy + row * scale + offY;
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              blend(px0 + dx, py0 + dy, ...color, a);
            }
          }
        }
      }
      cell++;
    }
  }
}

drawText('ONDAS BINAURALES', 600, 470, 8, [238, 240, 255]);
drawText('RELAJA · DUERME · CONCENTRA', 600, 565, 4, [196, 181, 253], 0.95, false);

// ---------------------------------------------------------------- Codificar PNG
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  raw[rowStart] = 0; // filtro None
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const o = rowStart + 1 + x * 4;
    raw[o] = Math.min(255, Math.max(0, Math.round(px[i])));
    raw[o + 1] = Math.min(255, Math.max(0, Math.round(px[i + 1])));
    raw[o + 2] = Math.min(255, Math.max(0, Math.round(px[i + 2])));
    raw[o + 3] = Math.min(255, Math.max(0, Math.round(px[i + 3])));
  }
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../public/og.png', import.meta.url), png);
console.log('public/og.png generado:', png.length, 'bytes');
