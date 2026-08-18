// src/ui/freq-cover.js
// Portada visual autogenerada para una frecuencia guardada: una miniatura SVG
// derivada de su forma de onda + un color propio (hash de sus datos). Sin
// subir archivos ni guardar nada nuevo: waveform/carrier/beat ya viajan en
// FrequencyOut (backend), esto solo los dibuja.

const PALETTE = [
  ['#7c3aed', '#c4b5fd'], // violeta
  ['#0ea5e9', '#bae6fd'], // celeste
  ['#f97316', '#fed7aa'], // naranja
  ['#10b981', '#a7f3d0'], // verde
  ['#ec4899', '#fbcfe8'], // rosa
  ['#eab308', '#fef08a'], // amarillo
];

function hashSeed(freq) {
  const s = `${freq?.name || ''}|${freq?.carrier_frequency || 0}|${freq?.beat_frequency || 0}|${freq?.waveform || ''}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function waveformPath(waveform, w, h) {
  const midY = h / 2;
  const amp = h * 0.32;
  const cycles = 2;
  const steps = 48;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * w;
    const phase = t * cycles * Math.PI * 2;
    let y;
    if (waveform === 'square') {
      y = midY - amp * Math.sign(Math.sin(phase) || 1);
    } else if (waveform === 'triangle') {
      y = midY - amp * (2 / Math.PI) * Math.asin(Math.sin(phase));
    } else if (waveform === 'sawtooth') {
      const frac = (phase / (Math.PI * 2)) % 1;
      y = midY - amp * (2 * (frac - Math.floor(frac + 0.5)));
    } else {
      y = midY - amp * Math.sin(phase); // sine (default)
    }
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** SVG inline (string) — miniatura cuadrada ("portada") de una frecuencia guardada. */
export function freqCoverSVG(freq, size = 48) {
  const seed = hashSeed(freq);
  const [dark, light] = PALETTE[seed % PALETTE.length];
  const path = waveformPath(freq?.waveform || 'sine', size, size);
  const gid = `fc-${seed.toString(36)}`;
  return `<svg class="freq-cover" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Portada de ${escapeAttr(freq?.name || 'frecuencia')}">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${light}" />
        <stop offset="1" stop-color="${dark}" />
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${(size * 0.22).toFixed(1)}" fill="url(#${gid})" />
    <path d="${path}" fill="none" stroke="#ffffff" stroke-width="${Math.max(1.5, size * 0.045).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" />
  </svg>`;
}
