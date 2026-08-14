// Genera los íconos del launcher Android a partir del MISMO diseño de la PWA
// (public/icons/icon-512.png: fondo oscuro + 5 barras píldora con gradiente
// violeta→azul). PNG puro vía zlib (sin dependencias), supersampling 4x.
//
// Escribe `ic_launcher_foreground.png` (barras con fondo transparente) en las
// densidades mdpi..xxxhdpi para el ícono adaptativo (minSdk 26). El fondo del
// ícono es @color/ic_launcher_background y la máscara adaptativa lo recorta.
//
// Uso: node scripts/gen-launcher-icons.cjs
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
// 108dp en cada densidad → px (dpi/160).
const DENSITIES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

// ---- Codificador PNG (igual que gen-icons.cjs) ----
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Dibujo: solo las barras (fondo transparente) ----
const SS = 4;
const lerp = (a, b, t) => a + (b - a) * t;
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function renderForeground(size) {
  const S = size * SS;
  const top = [167, 139, 250]; // #a78bfa
  const bot = [96, 165, 250]; // #60a5fa
  const acc = new Float32Array(S * S * 4);

  const put = (x, y, col, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    acc[i] += col[0] * a;
    acc[i + 1] += col[1] * a;
    acc[i + 2] += col[2] * a;
    acc[i + 3] += a;
  };

  // Escala 0.85: deja margen para la máscara circular del ícono adaptativo.
  const k = 0.85;
  const bar = (cx, h, w) => {
    const half = w / 2;
    const yTop = (S - h) / 2;
    const yBot = (S + h) / 2;
    for (let y = Math.floor(yTop - 1); y <= Math.ceil(yBot + 1); y++) {
      for (let x = Math.floor(cx - half - 1); x <= Math.ceil(cx + half + 1); x++) {
        let inside;
        if (y >= yTop + half && y <= yBot - half) {
          inside = Math.abs(x - cx) <= half;
        } else {
          const cy = y < yTop + half ? yTop + half : yBot - half;
          const dx = x - cx;
          const dy = y - cy;
          inside = dx * dx + dy * dy <= half * half;
        }
        if (inside) put(x, y, mix(top, bot, y / S), 1);
      }
    }
  };

  const heights = [0.36, 0.58, 0.82, 0.58, 0.36];
  const w = S * 0.095 * k;
  heights.forEach((h, i) => {
    const cx = S / 2 + (i - 2) * S * 0.13 * k;
    bar(cx, h * S * k, w);
  });

  // Reducción de resolución (SS × SS → 1).
  const out = Buffer.alloc(size * size * 4);
  const div = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          ar += acc[i];
          ag += acc[i + 1];
          ab += acc[i + 2];
          aa += acc[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      if (aa > 0) {
        out[o] = Math.round(ar / aa);
        out[o + 1] = Math.round(ag / aa);
        out[o + 2] = Math.round(ab / aa);
        out[o + 3] = Math.round((aa / div) * 255);
      } else {
        out[o + 3] = 0;
      }
    }
  }
  return encodePng(size, size, out);
}

Object.entries(DENSITIES).forEach(([density, size]) => {
  const dir = path.join(RES, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'ic_launcher_foreground.png');
  fs.writeFileSync(file, renderForeground(size));
  console.log('ok', file, fs.statSync(file).size, 'bytes');
});
