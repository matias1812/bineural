import './style.css';
import { inject } from '@vercel/analytics';
import { BinauralEngine } from './audio.js';
import { AmbientEngine } from './ambient.js';
import { WaveField } from './wavefield.js';
import { initStarfield } from './starfield.js';

// Initialize Vercel Analytics (no-op in development)
inject();

initStarfield();

const engine = new BinauralEngine();
const ambient = new AmbientEngine();

// ---------------------------------------------------------------- Iconos SVG
// Reemplazan a los emojis: iconos de trazo (estilo Lucide) que heredan el
// color del texto (currentColor) y escalan con el tamaño de fuente (.ico).
function icon(paths) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
const ICONS = {
  meditacion: icon('<circle cx="12" cy="4.5" r="2.5"/><path d="M12 7.5c-2.2 0-3.8 1.5-3.8 3.4 0 1.4.5 2.3 1.3 2.8L8 18.5h8l-1.5-4.8c.8-.5 1.3-1.4 1.3-2.8 0-1.9-1.6-3.4-3.8-3.4z"/><path d="M8.5 18.5 6 21M15.5 18.5 18 21"/>'),
  sueno: icon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  relajacion: icon('<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>'),
  concentracion: icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  energia: icon('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
  creatividad: icon('<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/><path d="M19 3v4M17 5h4"/>'),
  aprendizaje: icon('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"/><path d="M22 10v5"/>'),
  schumann: icon('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  'sueno-ligero': icon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/><path d="M18 2.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  profundidad: icon('<path d="M12 3v13"/><path d="m6.5 11.5 5.5 5.5 5.5-5.5"/><path d="M5 21h14"/>'),
  calma: icon('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'),
  intuicion: icon('<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>'),
  lucidez: icon('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>'),
  alerta: icon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  memoria: icon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  armonia: icon('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
  despertar: icon('<path d="M12 2v8"/><path d="m8 6 4-4 4 4"/><path d="m4.93 10.93 1.41 1.41"/><path d="m19.07 10.93-1.41 1.41"/><path d="M16 18a4 4 0 0 0-8 0"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="M22 22H2"/>'),
  foco: icon('<circle cx="12" cy="12" r="9"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/>'),
  renovacion: icon('<path d="M7 20h10"/><path d="M12 20v-8"/><path d="M12 12C12 8.5 9.5 6.5 5.5 6.5c0 3.5 2.5 5.5 6.5 5.5z"/><path d="M12 9c0-2.5-1.5-4.5-4.5-5 0 2.5 1.5 4.5 4.5 5z"/>'),
  silencio: icon('<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'),
  vitalidad: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  vision: icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  estudio: icon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
  paz: icon('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>'),
  equilibrio: icon('<path d="M12 4v17"/><path d="M8 21h8"/><path d="M4 7h16"/><path d="M4 7a3 3 0 0 0 6 0"/><path d="M14 7a3 3 0 0 0 6 0"/>'),
  gateway: icon('<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>'),
  hemisync: icon('<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>'),
  personalizado: icon('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>'),
  // Iconos de la interfaz
  headphones: icon('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'),
  music: icon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  sparkle: icon('<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>'),
  grid: icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
  volume: icon('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  clock: icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  history: icon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'),
  leaf: icon('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'),
  droplet: icon('<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>'),
  tree: icon('<path d="M12 2l-4.5 8h3L6 18h12l-4.5-8h3z"/><path d="M12 18v3"/>'),
  bird: icon('<path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/>'),
  sliders: icon('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>'),
  alert: icon('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  heart: icon('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
  play: icon('<polygon points="6 3 20 12 6 21 6 3"/>'),
  pause: icon('<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'),
  star: icon('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>'),
  share: icon('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>'),
  expand: icon('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  compress: icon('<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>'),
};

// ---------------------------------------------------------------- Estados
const STATES = [
  { id: 'meditacion', icon: ICONS.meditacion, name: 'Meditación', desc: 'Calma mental profunda y claridad interior', band: 'Theta · 6 Hz', color: '#a78bfa', base: 210, beat: 6 },
  { id: 'sueno', icon: ICONS.sueno, name: 'Sueño profundo', desc: 'Relajación total para un descanso profundo', band: 'Delta · 2 Hz', color: '#60a5fa', base: 170, beat: 2 },
  { id: 'relajacion', icon: ICONS.relajacion, name: 'Relajación', desc: 'Reduce el estrés y la ansiedad del día', band: 'Alpha · 10 Hz', color: '#34d399', base: 200, beat: 10 },
  { id: 'concentracion', icon: ICONS.concentracion, name: 'Concentración', desc: 'Atención sostenida y mayor productividad', band: 'Beta · 16 Hz', color: '#fbbf24', base: 240, beat: 16 },
  { id: 'energia', icon: ICONS.energia, name: 'Energía', desc: 'Estado de alerta, vitalidad y motivación', band: 'Beta · 25 Hz', color: '#fb7185', base: 260, beat: 25 },
  { id: 'creatividad', icon: ICONS.creatividad, name: 'Creatividad', desc: 'Flujo creativo e inspiración', band: 'Theta · 8 Hz', color: '#f0abfc', base: 220, beat: 8 },
  { id: 'aprendizaje', icon: ICONS.aprendizaje, name: 'Aprendizaje', desc: 'Memoria y procesamiento profundo', band: 'Gamma · 40 Hz', color: '#f97316', base: 280, beat: 40 },
  { id: 'schumann', icon: ICONS.schumann, name: 'Resonancia Schumann', desc: 'La frecuencia de la Tierra: calma y conexión', band: 'Schumann · 7.83 Hz', color: '#4ade80', base: 190, beat: 7.83 },
  { id: 'sueno-ligero', icon: ICONS['sueno-ligero'], name: 'Sueño ligero', desc: 'Transición suave hacia el descanso', band: 'Delta · 3 Hz', color: '#818cf8', base: 180, beat: 3 },
  { id: 'profundidad', icon: ICONS.profundidad, name: 'Profundidad', desc: 'Inmersión total en el descanso', band: 'Delta · 1 Hz', color: '#6d6ee8', base: 160, beat: 1 },
  { id: 'calma', icon: ICONS.calma, name: 'Calma', desc: 'Serenidad ligera para el día a día', band: 'Theta · 5 Hz', color: '#2dd4bf', base: 195, beat: 5 },
  { id: 'intuicion', icon: ICONS.intuicion, name: 'Intuición', desc: 'Conexión interior y claridad sutil', band: 'Theta · 4.5 Hz', color: '#a78bfa', base: 205, beat: 4.5 },
  { id: 'lucidez', icon: ICONS.lucidez, name: 'Lucidez', desc: 'Mente despejada y foco agudo', band: 'Beta · 18 Hz', color: '#f59e0b', base: 250, beat: 18 },
  { id: 'alerta', icon: ICONS.alerta, name: 'Alerta', desc: 'Energía y disposición inmediata', band: 'Beta · 22 Hz', color: '#f87171', base: 270, beat: 22 },
  { id: 'memoria', icon: ICONS.memoria, name: 'Memoria', desc: 'Fijar recuerdos y consolidar estudio', band: 'Gamma · 32 Hz', color: '#fb923c', base: 300, beat: 32 },
  { id: 'armonia', icon: ICONS.armonia, name: 'Armonía', desc: 'Equilibrio emocional y bienestar', band: 'Alfa · 9 Hz', color: '#38bdf8', base: 215, beat: 9 },
  { id: 'despertar', icon: ICONS.despertar, name: 'Despertar', desc: 'Saliendo del sueño con suavidad', band: 'Alfa · 12 Hz', color: '#fbbf24', base: 230, beat: 12 },
  { id: 'foco', icon: ICONS.foco, name: 'Foco profundo', desc: 'Atención sostenida sin distraerte', band: 'Beta · 14 Hz', color: '#34d399', base: 260, beat: 14 },
  { id: 'renovacion', icon: ICONS.renovacion, name: 'Renovación', desc: 'Descanso reparador de la noche', band: 'Delta · 2.5 Hz', color: '#4ade80', base: 175, beat: 2.5 },
  { id: 'silencio', icon: ICONS.silencio, name: 'Silencio interior', desc: 'Vacío mental y paz profunda', band: 'Theta · 3.5 Hz', color: '#c4b5fd', base: 200, beat: 3.5 },
  { id: 'vitalidad', icon: ICONS.vitalidad, name: 'Vitalidad', desc: 'Arrancar el día con energía', band: 'Beta · 20 Hz', color: '#fde047', base: 265, beat: 20 },
  { id: 'vision', icon: ICONS.vision, name: 'Visión clara', desc: 'Claridad mental y comprensión rápida', band: 'Gamma · 38 Hz', color: '#f472b6', base: 310, beat: 38 },
  { id: 'estudio', icon: ICONS.estudio, name: 'Estudio', desc: 'Concentración para aprender', band: 'Beta · 15 Hz', color: '#93c5fd', base: 245, beat: 15 },
  { id: 'paz', icon: ICONS.paz, name: 'Paz', desc: 'Serenidad total en el presente', band: 'Theta · 4 Hz', color: '#e0e7ff', base: 190, beat: 4 },
  { id: 'equilibrio', icon: ICONS.equilibrio, name: 'Equilibrio', desc: 'Calma y estabilidad emocional', band: 'Alfa · 7 Hz', color: '#5eead4', base: 210, beat: 7 },
  { id: 'gateway', icon: ICONS.gateway, name: 'Gateway', desc: 'El experimento: expansión de conciencia (Foco 10)', band: 'Theta · 4 Hz', color: '#a78bfa', base: 200, beat: 4 },
  { id: 'hemisync', icon: ICONS.hemisync, name: 'Hemi-Sync', desc: 'Sincronización de hemisferios (Foco 12)', band: 'Theta · 5.5 Hz', color: '#818cf8', base: 210, beat: 5.5 },
  { id: 'personalizado', icon: ICONS.personalizado, name: 'Personalizado', desc: 'Diseña tu propia frecuencia a tu gusto', band: 'A tu medida', color: '#22d3ee', base: 220, beat: 10, custom: true },
];

// ---------------------------------------------------------------- DOM
const grid = document.getElementById('states-grid');
const playBtn = document.getElementById('play-btn');
const volume = document.getElementById('volume');
const volumeLabel = document.getElementById('volume-label');
const timerOptions = document.getElementById('timer-options');
const timerDisplay = document.getElementById('timer-display');
const ambientOptions = document.getElementById('ambient-options');
const customPanel = document.getElementById('custom-panel');
const customBase = document.getElementById('custom-base');
const customBaseLabel = document.getElementById('custom-base-label');
const customBeat = document.getElementById('custom-beat');
const customBeatLabel = document.getElementById('custom-beat-label');
const customWave = document.getElementById('custom-wave');
const statusName = document.getElementById('status-name');
const statusFreqs = document.getElementById('status-freqs');
const statusState = document.getElementById('status-state');
const legendLeft = document.getElementById('legend-left');
const legendRight = document.getElementById('legend-right');
const legendBeat = document.getElementById('legend-beat');
const canvas = document.getElementById('visualizer');
const ctx2d = canvas.getContext('2d');

// ---------------------------------------------------------------- Estado de la app
let selected = STATES[0];
let playing = false;
let volumeLevel = 0.6;
let timerMinutes = 0;
let timerEnd = 0;
let timerInterval = null;
let lastPulse = 0;
let accentColor = STATES[0].color;
let sessionStartTime = 0;
let fading = false;
// Colores del visualizador (se inicializan aquí para que estén disponibles
// desde el arranque; selectState los actualiza al elegir estado).
let LANE_LEFT_COLOR = '#60a5fa';
let LANE_RIGHT_COLOR = '#f472b6';
let LANE_LEFT_COLOR_RGB = [96, 165, 250];
let LANE_RIGHT_COLOR_RGB = [244, 114, 182];
let ACCENT_RGB = [167, 139, 250];

// ---------------------------------------------------------------- Persistencia local
// Todo queda en localStorage (sin servidores ni cuentas): la sesión (último
// estado, volumen, ambientes y temporizador), los favoritos y el historial
// de sesiones.
const LS_SESSION = 'ob-session-v1';
const LS_FAVS = 'ob-favs-v1';
const LS_HISTORY = 'ob-history-v1';

function lsGet(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (_) {
    /* almacenamiento no disponible */
  }
}

// ---------------------------------------------------------------- Portadora
// La portadora (f1) es ortogonal al estado: el estado define el Δf (latido)
// y la portadora define la frecuencia base. Así cualquier combinación es
// posible (p. ej. Beta + 136,1 Hz) sin multiplicar los presets fijos.
const LS_CARRIER = 'ob-carrier-v1';
const CARRIER_BASE = { estandar: null, estandar220: 220, solfeggio: 528, ancestral: 136.1, schumann: 194.7, personalizado: 'custom' };
// Referencia estándar sobre la que se escala: la afinación de referencia es
// A=432 Hz (Verdi) en lugar de la base canónica de 220 Hz.
const STANDARD_BASE = 432;
// Escalado proporcional (opción B): cada preset conserva su identidad relativa
// al elegir una familia de portadora (528 Solfeggio, 136,1 Ancestral). En vez
// de fijar la misma base para todos, se multiplica la base propia del estado
// por la razón familia/estándar: un preset de 432 Hz → 528 Hz exacto en la
// familia Solfeggio, y los presets más graves que el estándar siguen sonando
// más graves que los agudos, todos "afinados" a la misma referencia.
function scaleCarrier(originalF1, targetBase) {
  return +(originalF1 * (targetBase / STANDARD_BASE)).toFixed(1);
}
let carrier = lsGet(LS_CARRIER, 'estandar');
if (!(carrier in CARRIER_BASE)) carrier = 'estandar';
const carrierOptions = document.getElementById('carrier-options');
const carrierWarning = document.getElementById('carrier-warning');

let favorites = new Set(lsGet(LS_FAVS, []));

// ---------------------------------------------------------------- Tarjetas
const cards = STATES.map((s) => {
  const card = document.createElement('button');
  card.className = 'card';
  card.dataset.id = s.id;
  const fav = favorites.has(s.id);
  card.innerHTML = `
    <span class="card-star${fav ? ' fav' : ''}" role="button" tabindex="0" aria-label="Marcar ${s.name} como favorito" aria-pressed="${fav}">${ICONS.star}</span>
    <span class="card-icon" style="color:${s.color}">${s.icon}</span>
    <span class="card-name">${s.name}</span>
    <span class="card-band">${s.band}</span>
    <span class="card-desc">${s.desc}</span>
  `;
  card.addEventListener('click', () => selectState(s));
  const star = card.querySelector('.card-star');
  star.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFav(s, star);
  });
  star.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleFav(s, star);
    }
  });
  grid.appendChild(card);
  return card;
});

// Marca o desmarca un estado como favorito (persistente en localStorage).
function toggleFav(state, starEl) {
  if (favorites.has(state.id)) favorites.delete(state.id);
  else favorites.add(state.id);
  lsSet(LS_FAVS, [...favorites]);
  if (starEl) {
    starEl.classList.toggle('fav', favorites.has(state.id));
    starEl.setAttribute('aria-pressed', String(favorites.has(state.id)));
  }
  // Si estamos filtrando por favoritos, actualizar la rejilla al momento.
  const activeChip = bandFilter.querySelector('.band-chip.active');
  if (activeChip && activeChip.dataset.band === 'favs') applyBandFilter('favs');
}

// Guarda la sesión actual (último estado, volumen, ambientes y temporizador)
// para recuperarla al volver a la página.
function saveSession() {
  const layerVolumes = {};
  document.querySelectorAll('#ambient-volumes input').forEach((i) => {
    layerVolumes[i.dataset.type] = parseFloat(i.value);
  });
  lsSet(LS_SESSION, {
    state: selected.id,
    volume: volumeLevel,
    ambient: [...ambientTypes],
    ambientVolume: ambientVolumeLevel,
    layerVolumes,
    timer: timerMinutes,
  });
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Mezcla dos colores hex (t = 0 → a, t = 1 → b).
function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function selectState(state) {
  selected = state;
  // El estado Personalizado usa su propia portadora (el slider de base).
  if (state.custom && carrier !== 'personalizado') {
    carrier = 'personalizado';
    syncCarrierChips();
  }
  cards.forEach((c) => c.classList.toggle('selected', c.dataset.id === state.id));
  accentColor = state.color;
  ACCENT_RGB = hexToRgb(state.color);
  document.documentElement.style.setProperty('--accent', state.color);
  document.documentElement.style.setProperty('--accent-soft', hexToRgba(state.color, 0.16));
  // Las tres gotas adoptan la paleta del estado: frecuencia 1 se tiñe hacia
  // azul, frecuencia 2 hacia rosa, y el cerebro usa el color del estado.
  // Así cada frecuencia se ve distinta en las gotas al cambiar de estado.
  LANE_LEFT_COLOR = mixHex(state.color, '#60a5fa', 0.5);
  LANE_RIGHT_COLOR = mixHex(state.color, '#f472b6', 0.5);
  LANE_LEFT_COLOR_RGB = hexToRgb(LANE_LEFT_COLOR);
  LANE_RIGHT_COLOR_RGB = hexToRgb(LANE_RIGHT_COLOR);
  updateCustomPanel();
  updateStatus();
  updateCarrierWarning();
  if (playing) {
    // Transición suave: las frecuencias se deslizan sin cortar el sonido.
    engine.retune(currentParams());
    applyAmbient();
  }
  saveSession();
  updateUrl();
}

// ---------------------------------------------------------------- Audio
function currentParams() {
  let base;
  if (selected.custom) {
    base = parseFloat(customBase.value);
  } else if (carrier === 'solfeggio' || carrier === 'ancestral') {
    // Escalado proporcional: el estado conserva su identidad relativa dentro
    // de la familia elegida (p. ej. en 528: Paz → 528 Hz, Gateway → 480 Hz).
    base = scaleCarrier(selected.base, CARRIER_BASE[carrier]);
  } else if (carrier === 'schumann') {
    // La portadora Schumann usa 194,7 Hz literal como f1 (la base tonal);
    // el latido lo sigue dando el estado. No es una familia escalada.
    base = 194.7;
  } else if (carrier === 'estandar220') {
    // Estándar impuesto: 220 Hz fijo como f1 (la base tonal), para todos
    // los estados; el latido lo sigue dando cada estado.
    base = 220;
  } else if (carrier === 'personalizado') {
    base = parseFloat(customBase.value);
  } else {
    base = selected.base; // estándar: la base propia del estado
  }
  const beat = selected.custom ? parseFloat(customBeat.value) : selected.beat;
  const wave = selected.custom ? customWave.value : 'sine';
  return { base, beat, wave, volume: volumeLevel };
}

function applyAudio() {
  engine.start(currentParams());
  applyAmbient();
}

function applyAmbient() {
  if (!playing) return;
  ambient.attach(engine.ctx, engine.masterGain);
  ambient.syncToEngine(engine);
  ambient.setVolume(ambientVolumeLevel);
  // Las capas activas coinciden con los botones elegidos y la respiración
  // queda alineada a la fase del latido (mismo reloj que las ondas).
  ambient.applySet(ambientTypes, currentParams().beat, engine.getBeatEpoch());
}

function start() {
  engine.onBeatPulse = () => {
    lastPulse = performance.now();
  };
  // `playing` se marca antes de applyAudio(): applyAmbient() depende de él
  // para crear las capas de ambiente al arrancar la sesión.
  playing = true;
  sessionStartTime = Date.now();
  applyAudio();
  playBtn.classList.add('playing');
  playBtn.innerHTML = `<span class="play-icon">${ICONS.pause}</span><span class="play-text">Pausar</span>`;
  updateStatus();
  armTimer();
  saveSession();
  updateRotControls();
}

function stop() {
  engine.stop(true);
  ambient.stopAll();
  playing = false;
  playBtn.classList.remove('playing');
  playBtn.innerHTML = `<span class="play-icon">${ICONS.play}</span><span class="play-text">Comenzar</span>`;
  updateStatus();
  disarmTimer();
  recordHistory();
  saveSession();
  updateRotControls();
}

// ---------------------------------------------------------------- Historial
// Registra la sesión terminada (estado, duración real y fecha) en
// localStorage y refresca el resumen del día.
function recordHistory() {
  if (!sessionStartTime) return;
  const durMin = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
  const rec = {
    id: selected.id,
    name: selected.name,
    band: selected.band,
    min: durMin,
    ts: Date.now(),
  };
  const h = lsGet(LS_HISTORY, []);
  h.push(rec);
  lsSet(LS_HISTORY, h.slice(-50));
  sessionStartTime = 0;
  updateHistory();
}

// El historial vive en el botón con forma de reloj (esquina superior
// izquierda del visualizador): solo el icono, y el resumen del día se
// muestra como tooltip. La lista completa está en el modal.
function updateHistory() {
  const btn = document.getElementById('history-btn');
  if (!btn) return;
  btn.innerHTML = ICONS.history;
  const h = lsGet(LS_HISTORY, []);
  const today = h.filter((r) => new Date(r.ts).toDateString() === new Date().toDateString());
  if (today.length) {
    const mins = today.reduce((a, r) => a + r.min, 0);
    const hm = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    btn.setAttribute('aria-label', `Historial de sesiones · ${hm} hoy`);
    btn.title = `Historial de sesiones · ${hm} hoy`;
  } else {
    btn.setAttribute('aria-label', 'Historial de sesiones');
    btn.title = 'Historial de sesiones';
  }
}

function openHistory() {
  renderHistory();
  document.getElementById('history-modal').classList.remove('hidden');
}

function closeHistory() {
  document.getElementById('history-modal').classList.add('hidden');
}

function renderHistory() {
  const h = lsGet(LS_HISTORY, []);
  const todayEl = document.getElementById('history-today');
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const today = h.filter((r) => new Date(r.ts).toDateString() === new Date().toDateString());
  if (today.length) {
    const mins = today.reduce((a, r) => a + r.min, 0);
    const hm = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    todayEl.classList.remove('hidden');
    todayEl.innerHTML = `${ICONS.clock} Hoy: <b>${hm}</b> de práctica · ${today.length} ${today.length === 1 ? 'sesión' : 'sesiones'}`;
  } else {
    todayEl.classList.add('hidden');
  }
  list.innerHTML = '';
  if (!h.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  [...h].reverse().forEach((r) => {
    const li = document.createElement('li');
    const d = new Date(r.ts);
    const state = STATES.find((s) => s.id === r.id);
    const when =
      d.toLocaleDateString('es', { day: 'numeric', month: 'short' }) +
      ' · ' +
      d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    li.innerHTML = `
      <span class="hl-icon" style="color:${state ? state.color : 'var(--accent)'}">${state ? state.icon : ICONS.history}</span>
      <span class="hl-main"><b>${r.name}</b><small>${r.band} · ${when}</small></span>
      <span class="hl-min">${r.min} min</span>
    `;
    li.addEventListener('click', () => {
      const st = STATES.find((s) => s.id === r.id);
      if (st) selectState(st);
      closeHistory();
    });
    list.appendChild(li);
  });
}

// Abrir/cerrar el panel de historial.
document.getElementById('history-btn').addEventListener('click', openHistory);
document.getElementById('history-close').addEventListener('click', closeHistory);
document.getElementById('history-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('history-modal')) closeHistory();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('history-modal').classList.contains('hidden')) {
    closeHistory();
  }
});

playBtn.addEventListener('click', () => {
  if (playing) stop();
  else start();
});

// ---------------------------------------------------------------- Volumen
volume.addEventListener('input', () => {
  volumeLevel = parseFloat(volume.value);
  volumeLabel.textContent = `${Math.round(volumeLevel * 100)}%`;
  engine.setVolume(volumeLevel);
  saveSession();
});

// ---------------------------------------------------------------- Temporizador
function armTimer() {
  disarmTimer();
  if (!timerMinutes) {
    timerDisplay.classList.add('hidden');
    return;
  }
  timerEnd = Date.now() + timerMinutes * 60000;
  timerDisplay.classList.remove('hidden');
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
  // Pedir permiso de notificación dentro del gesto del usuario, para poder
  // avisar cuando la sesión termine aunque cambies de pestaña.
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function tickTimer() {
  const remain = Math.max(0, Math.round((timerEnd - Date.now()) / 1000));
  const m = Math.floor(remain / 60);
  const s = remain % 60;
  timerDisplay.innerHTML = `${ICONS.clock} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (remain <= 0) endSession();
}

// Fin del temporizador: el audio se desvanece suavemente en vez de cortar,
// se avisa con una notificación (si la pestaña no está visible) y la sesión
// queda registrada en el historial.
function endSession() {
  if (fading) return;
  fading = true;
  disarmTimer();
  timerDisplay.innerHTML = `${ICONS.clock} Desvaneciendo…`;
  if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('Vyneural', {
        body: `Tu sesión de ${selected.name} ha terminado. Que descanses.`,
      });
    } catch (_) {
      /* el navegador rechazó la notificación */
    }
  }
  engine.fadeAndStop(1800, () => {
    fading = false;
    timerDisplay.classList.add('hidden');
    stop();
  });
}

function disarmTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

timerOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.timer-btn');
  if (!btn) return;
  timerMinutes = parseInt(btn.dataset.minutes, 10);
  timerOptions.querySelectorAll('.timer-btn').forEach((b) => b.classList.toggle('active', b === btn));
  if (playing) armTimer();
  else timerDisplay.classList.add('hidden');
  saveSession();
});

// ---------------------------------------------------------------- Ambiente
// Varios sonidos a la vez: cada botón activa/desactiva su capa.
let ambientTypes = new Set();
let ambientVolumeLevel = 0.7;

const ambientVolume = document.getElementById('ambient-volume');
const ambientVolumeLabel = document.getElementById('ambient-volume-label');
ambientVolume.addEventListener('input', () => {
  ambientVolumeLevel = parseFloat(ambientVolume.value);
  ambientVolumeLabel.textContent = `${Math.round(ambientVolumeLevel * 100)}%`;
  ambient.setVolume(ambientVolumeLevel);
  saveSession();
});

// Volumen individual por sonido de ambiente.
document.querySelectorAll('#ambient-volumes input').forEach((inp) => {
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    const label = inp.closest('.av').querySelector('b');
    label.textContent = `${Math.round(v * 100)}%`;
    ambient.setLayerVolume(inp.dataset.type, v);
    saveSession();
  });
});

// El mezclador de ambientes se abre/cierra con un botón.
const mixerBtn = document.getElementById('ambient-mixer-btn');
const mixer = document.getElementById('ambient-mixer');
mixerBtn.addEventListener('click', () => {
  const open = mixer.classList.toggle('open');
  mixerBtn.setAttribute('aria-expanded', String(open));
  mixerBtn.innerHTML = open ? `${ICONS.sliders} Cerrar mezclador` : `${ICONS.sliders} Mezclador`;
});

function updateAmbientButtons() {
  ambientOptions.querySelectorAll('.ambient-btn').forEach((b) => {
    const t = b.dataset.type;
    b.classList.toggle('active', t ? ambientTypes.has(t) : ambientTypes.size === 0);
  });
}

ambientOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.ambient-btn');
  if (!btn) return;
  const type = btn.dataset.type;
  if (!type) {
    ambientTypes.clear();
  } else if (ambientTypes.has(type)) {
    ambientTypes.delete(type);
  } else {
    ambientTypes.add(type);
  }
  updateAmbientButtons();
  saveSession();
  if (playing) {
    applyAmbient();
  } else if (ambientTypes.size > 0) {
    start(); // arranca la sesión para poder oír el ambiente
  }
});

// ---------------------------------------------------------------- Personalizado
function updateCustomLabels() {
  customBaseLabel.textContent = `Portadora: ${customBase.value} Hz`;
  customBeatLabel.textContent = `Ritmo binaural: ${customBeat.value} Hz`;
}

customBase.addEventListener('input', () => {
  updateCustomLabels();
  if ((selected.custom || carrier === 'personalizado') && playing) {
    engine.retune(currentParams());
    applyAmbient();
  }
  // El reproductor (estado, leyenda y frecuencias) refleja el valor nuevo.
  updateStatus();
  updateCarrierWarning();
  saveSession();
  updateUrl();
});
customBeat.addEventListener('input', () => {
  updateCustomLabels();
  if (selected.custom && playing) {
    engine.retune(currentParams());
    applyAmbient();
  }
  // El reproductor (estado, leyenda y frecuencias) refleja el valor nuevo.
  updateStatus();
  saveSession();
});
customWave.addEventListener('change', () => {
  if (selected.custom && playing) applyAudio();
  updateStatus();
});

// ---------------------------------------------------------------- Portadora
// Cambia la portadora activa y reajusta todo (audio, estado, URL, sesión).
function applyCarrier(c) {
  if (!(c in CARRIER_BASE)) return;
  carrier = c;
  syncCarrierChips();
  updateCustomPanel();
  if (playing) {
    engine.retune(currentParams());
    applyAmbient();
  }
  updateStatus();
  updateCarrierWarning();
  lsSet(LS_CARRIER, carrier);
  saveSession();
  updateUrl();
}

// El panel personalizado se muestra con el estado Personalizado o con la
// portadora Personalizado; en ese último caso solo aplica la base (el Δf
// lo sigue dando el estado).
function updateCustomPanel() {
  const show = selected.custom || carrier === 'personalizado';
  customPanel.classList.toggle('hidden', !show);
  customPanel.querySelectorAll('.custom-beat-only').forEach((el) =>
    el.classList.toggle('hidden', !selected.custom),
  );
}

// Aviso sutil si la portadora es tan grave que el latido se percibe mal.
function updateCarrierWarning() {
  if (!carrierWarning) return;
  const base = currentParams().base;
  carrierWarning.classList.toggle('hidden', !(typeof base === 'number' && base < 80));
}

// La URL refleja estado + portadora para compartir y enlazar directo. Lleva la
// familia de portadora (?carrier=…) porque la base efectiva de las familias
// fijas se deriva del estado al cargar; solo en Personalizado se fija f1.
function currentUrlParams() {
  const p = new URLSearchParams();
  p.set('state', selected.id);
  if (carrier !== 'estandar') p.set('carrier', carrier);
  if (carrier === 'personalizado') {
    const base = currentParams().base;
    if (typeof base === 'number') p.set('f1', String(Math.round(base * 10) / 10));
  }
  return p;
}
function updateUrl() {
  history.replaceState(null, '', `${location.pathname}?${currentUrlParams()}`);
}

carrierOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.carrier-btn');
  if (btn) applyCarrier(btn.dataset.carrier);
});

// ---------------------------------------------------------------- Extras
// Toast efímero para confirmaciones (enlace copiado, etc.).
let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Compartir: Web Share API con deep link al estado seleccionado
// (/?state=…) y fallback a copiar el enlace.
const shareBtn = document.getElementById('share-btn');
shareBtn.innerHTML = ICONS.share;

// Compartir: Web Share API con deep link al estado + portadora seleccionados
// y fallback a copiar el enlace. Lo usan el botón principal y el del modo girado.
async function shareLink() {
  const url = `${location.origin}/?${currentUrlParams()}`;
  const data = {
    title: 'Vyneural',
    text: `Escucha "${selected.name}" (${selected.band}) y viaja por el sonido.`,
    url,
  };
  try {
    if (navigator.share) {
      await navigator.share(data);
      return; // el usuario compartió (o canceló): no hacemos nada más
    }
  } catch (_) {
    return; // canceló el compartir nativo
  }
  // Sin Web Share: copiar al portapapeles, con último recurso de texto.
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado 🔗');
      return;
    }
  } catch (_) {
    /* portapapeles bloqueado: sigue al fallback */
  }
  window.prompt('Copia el enlace:', url);
}
shareBtn.addEventListener('click', shareLink);

// Pantalla completa / modo inmersivo: el visualizador y los controles
// ocupan toda la pantalla. En teléfono se intenta bloquear la orientación
// a horizontal y, si el bloqueo no es posible, un aviso obliga a girar el
// dispositivo antes de poder usar el modo.
const fullscreenBtn = document.getElementById('fullscreen-btn');
const rotateOverlay = document.getElementById('rotate-overlay');
const isTouchDevice = () =>
  (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && window.innerWidth < 900;
const isLandscape = () => window.matchMedia('(orientation: landscape)').matches;
// Modo girado: pantalla completa en un teléfono en vertical. El contenido se
// gira 90° con CSS y las gotas se dibujan a lo largo del eje Y del canvas
// para que aparezcan en horizontal sobre la pantalla (portraitImmersive).
let portraitImmersive = false;
const portraitQuery = window.matchMedia('(max-width: 900px) and (orientation: portrait)');

function updateRotateOverlay() {
  portraitImmersive = document.body.classList.contains('immersive') && portraitQuery.matches;
  updateRotControls();
  if (!rotateOverlay) return;
  const show = portraitImmersive && isTouchDevice() && !isLandscape();
  rotateOverlay.classList.toggle('hidden', !show);
}

// ---------------------------------------------------------------- Controles del modo girado
// En un teléfono en vertical a pantalla completa, junto a las gotas en
// horizontal se muestra una barra compacta (fuera del contenedor girado, así
// queda legible) con play, compartir y las portadoras.
const rotControls = document.getElementById('rot-controls');
const rotCarrierGroup = document.getElementById('rot-carriers');
const rotPlayBtn = document.getElementById('rot-play');
const rotShareBtn = document.getElementById('rot-share');

// Marca la portadora activa tanto en la fila principal como en la del modo girado.
function syncCarrierChips() {
  const groups = [carrierOptions, rotCarrierGroup].filter(Boolean);
  groups.forEach((g) =>
    g.querySelectorAll('.carrier-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.carrier === carrier),
    ),
  );
}

function updateRotControls() {
  if (!rotControls) return;
  rotControls.classList.toggle('hidden', !portraitImmersive);
  if (rotPlayBtn) {
    rotPlayBtn.querySelector('.play-text').textContent = playing ? 'Pausar' : 'Comenzar';
    rotPlayBtn.querySelector('.play-icon').innerHTML = playing ? ICONS.pause : ICONS.play;
  }
}

if (rotPlayBtn) {
  rotPlayBtn.addEventListener('click', () => {
    if (playing) stop();
    else start();
  });
}
if (rotShareBtn) {
  rotShareBtn.innerHTML = ICONS.share;
  rotShareBtn.addEventListener('click', shareLink);
}
if (rotCarrierGroup) {
  rotCarrierGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.carrier-btn');
    if (btn) applyCarrier(btn.dataset.carrier);
  });
}

fullscreenBtn.innerHTML = ICONS.expand;
fullscreenBtn.addEventListener('click', async () => {
  if (!document.fullscreenElement) {
    try {
      await document.documentElement.requestFullscreen?.();
    } catch (_) {
      /* pantalla completa no soportada */
    }
    // En teléfono, forzar horizontal (el lock requiere fullscreen activo).
    if (isTouchDevice()) {
      try {
        await screen.orientation.lock('landscape');
      } catch (_) {
        /* lock no disponible: el aviso de rotación se encarga */
      }
    }
  } else {
    try {
      screen.orientation.unlock?.();
    } catch (_) {
      /* no había lock activo */
    }
    document.exitFullscreen?.();
  }
});
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  document.body.classList.toggle('immersive', on);
  fullscreenBtn.innerHTML = on ? ICONS.compress : ICONS.expand;
  fullscreenBtn.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
  updateRotateOverlay();
  // El canvas se re-mide al entrar/salir del modo (el layout cambia).
  resizeCanvas();
});
// Si el usuario rota el teléfono o cambia el tamaño, el aviso se actualiza solo.
window.addEventListener('resize', updateRotateOverlay);
window.addEventListener('orientationchange', updateRotateOverlay);

// Atajos de teclado: Espacio = play/pausa, ←/→ = cambiar de estado.
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && typeof t.matches === 'function' && t.matches('input, select, textarea, [contenteditable="true"]')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (playing) stop();
    else start();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const visible = cards.filter((c) => !c.classList.contains('filtered-out'));
    if (!visible.length) return;
    const idx = visible.findIndex((c) => c.dataset.id === selected.id);
    const next = visible[(idx + (e.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length];
    selectState(STATES.find((st) => st.id === next.dataset.id));
    next.scrollIntoView({ block: 'nearest' });
  }
});

// ---------------------------------------------------------------- Estado
function updateStatus() {
  const p = currentParams();
  statusName.innerHTML = `${selected.icon} ${selected.name}`;
  statusFreqs.textContent = `Izquierda: ${p.base} Hz · Derecha: ${(p.base + p.beat).toFixed(1)} Hz · Latido percibido: ${p.beat} Hz`;
  legendLeft.textContent = `${p.base} Hz`;
  legendRight.textContent = `${(p.base + p.beat).toFixed(1)} Hz`;
  legendBeat.textContent = `${p.beat} Hz`;
  const dotL = document.getElementById('legend-dot-left');
  const dotR = document.getElementById('legend-dot-right');
  if (dotL) dotL.style.setProperty('--c', LANE_LEFT_COLOR);
  if (dotR) dotR.style.setProperty('--c', LANE_RIGHT_COLOR);
  statusState.textContent = playing ? '● Reproduciendo' : '○ En pausa';
}

// ---------------------------------------------------------------- Visualizador
// Física real de ondas en agua: cada gota es una cuenca circular simulada
// con la ecuación de onda 2D (WaveField). Las fuentes excitan el agua, las
// ondas se propagan, rebotan en el borde y se superponen formando patrones
// de interferencia reales. En la gota del cerebro conviven tres fuentes
// (azul = frecuencia 1, rosa = frecuencia 2, acento = latido) que chocan
// entre sí, y el latido inyecta un impulso exacto en cada pulso real.

function resizeCanvas() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let waveLeft = null;
let waveRight = null;
let waveBrainB = null;
let waveBrainP = null;
let waveBrainA = null;
let wavePoolR = 0;
let lastBeatPhase = 0;
// Momento del último impacto de cada fuente (gotas discretas que caen).
let impactTimes = { L: 0, R: 0, B: 0, P: 0, A: 0 };
let brainCanvas = null;
let brainCtx = null;
let brainImg = null;
let brainSize = 0;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// (LANE_LEFT_COLOR_RGB, LANE_RIGHT_COLOR_RGB y ACCENT_RGB se declaran arriba,
// junto al estado de la app, para que el arranque las use.)

// Crea (o recrea si cambió el tamaño) las cuencas de agua.
function ensureFields(poolR) {
  if (wavePoolR && Math.abs(wavePoolR - poolR) < 2) return;
  wavePoolR = poolR;
  const size = Math.max(48, Math.ceil(poolR) + 2);
  // c más lento y más amortiguación: anillos limpios y definidos que se
  // expanden y se apagan, sin acumularse en un revoltijo caótico.
  const opts = { c: 0.45, damp: 0.992 };
  waveLeft = new WaveField(size, opts);
  waveRight = new WaveField(size, opts);
  waveBrainB = new WaveField(size, opts);
  waveBrainP = new WaveField(size, opts);
  waveBrainA = new WaveField(size, opts);
  const s = size / 2;
  for (const f of [waveLeft, waveRight, waveBrainB, waveBrainP, waveBrainA]) {
    f.setCircle(s, s, s - 1.5);
  }
  if (brainSize !== size) {
    brainSize = size;
    brainCanvas = document.createElement('canvas');
    brainCanvas.width = size;
    brainCanvas.height = size;
    brainCtx = brainCanvas.getContext('2d');
    brainImg = brainCtx.createImageData(size, size);
  }
}

// La gota del cerebro: la unión de las tres frecuencias con un color limpio.
// El agua se tiñe con un degradado azul → acento → rosa (de izquierda a
// derecha) y la superficie es la superposición física de las tres ondas
// (vb + vp + va): las crestas brillan hacia blanco y los valles se oscurecen,
// como la luz reflejándose en agua real. La interferencia se ve en el
// brillo, no en colores que chocan.
function renderBrain() {
  const size = waveBrainB.size;
  const n = waveBrainB.n;
  const mask = waveBrainB.mask;
  const ub = waveBrainB.u;
  const up = waveBrainP.u;
  const ua = waveBrainA.u;
  const d = brainImg.data;
  const rb = LANE_LEFT_COLOR_RGB[0];
  const gb = LANE_LEFT_COLOR_RGB[1];
  const bb = LANE_LEFT_COLOR_RGB[2];
  const rp = LANE_RIGHT_COLOR_RGB[0];
  const gp = LANE_RIGHT_COLOR_RGB[1];
  const bp = LANE_RIGHT_COLOR_RGB[2];
  const ra = ACCENT_RGB[0];
  const ga = ACCENT_RGB[1];
  const ba = ACCENT_RGB[2];
  const s = size / 2;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (!mask[i]) {
      d[o] = 0;
      d[o + 1] = 0;
      d[o + 2] = 0;
      d[o + 3] = 0;
      continue;
    }
    // Color por posición: izquierda azul, centro acento, derecha rosa.
    const tx = (i % size - s) / (s - 1);
    let cr;
    let cg;
    let cb;
    if (tx <= 0) {
      const k = -tx;
      cr = rb + (ra - rb) * k;
      cg = gb + (ga - gb) * k;
      cb = bb + (ba - bb) * k;
    } else {
      const k = tx;
      cr = ra + (rp - ra) * k;
      cg = ga + (gp - ga) * k;
      cb = ba + (bp - ba) * k;
    }
    // Superficie del agua: suma física de las tres ondas, con ganancia visual.
    const v = (ub[i] + up[i] + ua[i]) * 2.6;
    let bri = 0.32 + v * 0.5;
    if (bri < 0.15) bri = 0.15;
    if (bri > 1.25) bri = 1.25;
    cr *= bri;
    cg *= bri;
    cb *= bri;
    if (v > 0.35) {
      const w = Math.min(1, (v - 0.35) * 0.9);
      cr += (255 - cr) * w;
      cg += (255 - cg) * w;
      cb += (255 - cb) * w;
    }
    d[o] = cr > 255 ? 255 : cr;
    d[o + 1] = cg > 255 ? 255 : cg;
    d[o + 2] = cb > 255 ? 255 : cb;
    d[o + 3] = 255;
  }
  brainCtx.putImageData(brainImg, 0, 0);
}

// Pinta una cuenca en el lienzo principal, recortada al círculo de la gota.
function drawField(field, rgb, cx, cy, r, composite, alpha = 1) {
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
  ctx2d.clip();
  if (composite) ctx2d.globalCompositeOperation = composite;
  ctx2d.globalAlpha = alpha;
  ctx2d.drawImage(field.render(rgb), cx - r, cy - r, r * 2, r * 2);
  ctx2d.restore();
}

function drawVisual() {
  requestAnimationFrame(drawVisual);
  const dpr = devicePixelRatio;
  const w = canvas.width;
  const h = canvas.height;
  ctx2d.clearRect(0, 0, w, h);

  const now = performance.now();
  const t = now / 1000;
  const p = currentParams();
  const beat = Math.max(0.5, p.beat);

  // Tres gotas en fila: frecuencia 1 | cerebro | frecuencia 2. En el modo
  // girado (pantalla completa en un teléfono vertical) la fila se dibuja a lo
  // largo del eje Y: al girar el lienzo 90° las gotas quedan horizontales en
  // pantalla, invitando a girar el celular.
  const rotated = portraitImmersive;
  const poolR = rotated ? Math.min(w, h / 3) * 0.45 : Math.min(h, w / 3) * 0.4;
  const cxs = rotated ? [w / 2, w / 2, w / 2] : [w / 6, w / 2, (5 * w) / 6];
  const cys = rotated ? [(5 * h) / 6, h / 2, h / 6] : [h / 2, h / 2, h / 2];
  const cy = h / 2;

  // Fase del latido real, tomada del reloj del AudioContext para que las
  // ondas brillen exactamente cuando suena el latido (fase 0 = pulso).
  // En pausa, respiración suave.
  const periodMs = Math.max(80, 1000 / beat);
  let phase;
  if (playing && engine.isPlaying) {
    const ph = engine.getBeatPhase();
    phase = ph != null ? ph : Math.min(1, (now - lastPulse) / periodMs);
  } else {
    phase = (now % 4000) / 4000;
  }
  // Respiración suave y continua: máximo justo en el latido (phase 0),
  // sin "flash" duro que dé sensación de reinicio.
  const eased = 0.5 + 0.5 * Math.cos(2 * Math.PI * phase);
  const beatBright = 0.62 + 0.38 * eased; // las tres gotas brillan al unísono

  // ----- Física: excitar fuentes y avanzar la simulación -------------------
  // Las portadoras se excitan a escala visual (la frecuencia real de audio
  // no cabe en 60 fps; lo que sí es real y exacto es el latido: su impulso
  // cae en la fase 0 del reloj del AudioContext, como el sonido).
  ensureFields(poolR);
  const size = waveLeft.size;
  const s = size / 2;
  const off = size * 0.1; // separación de las fuentes en la unión

  if (playing) {
    // Gotas discretas que caen a intervalos: cada impacto genera un anillo
    // limpio que se expande y se apaga. En la unión, las gotas azul y rosa
    // caen de fuentes desfasadas y sus anillos chocan al cruzarse.
    if (t - impactTimes.L >= 1.5) {
      waveLeft.pokeDisc(s, s, 1.5);
      impactTimes.L = t;
    }
    if (t - impactTimes.R >= 1.8) {
      waveRight.pokeDisc(s, s, 1.5);
      impactTimes.R = t;
    }
    if (t - impactTimes.B >= 1.3) {
      waveBrainB.pokeDisc(s - off, s, 1.3);
      impactTimes.B = t;
    }
    if (t - impactTimes.P >= 1.6) {
      waveBrainP.pokeDisc(s + off, s, 1.3);
      impactTimes.P = t;
    }
    // Latido: una gota de luz exacta en cada pulso real (fase 0).
    if (phase != null) {
      const wrapped = lastBeatPhase > phase && lastBeatPhase - phase > 0.5;
      if (wrapped) waveBrainA.pokeDisc(s, s, 1.8);
      lastBeatPhase = phase;
    }
  } else {
    // En pausa: gotas espaciadas y suaves, el agua sigue viva pero tranquila.
    if (t - impactTimes.L >= 3.2) {
      waveLeft.pokeDisc(s, s, 0.6);
      impactTimes.L = t;
    }
    if (t - impactTimes.R >= 3.2) {
      waveRight.pokeDisc(s, s, 0.6);
      impactTimes.R = t;
    }
    if (t - impactTimes.B >= 3.2) {
      waveBrainB.pokeDisc(s - off, s, 0.5);
      impactTimes.B = t;
    }
    if (t - impactTimes.P >= 3.2) {
      waveBrainP.pokeDisc(s + off, s, 0.5);
      impactTimes.P = t;
    }
    if (t - impactTimes.A >= 3.2) {
      waveBrainA.pokeDisc(s, s, 0.5);
      impactTimes.A = t;
    }
    lastBeatPhase = phase;
  }
  waveLeft.step();
  waveRight.step();
  waveBrainB.step();
  waveBrainP.step();
  waveBrainA.step();

  // ----- Render: pintar cada cuenca sobre su gota --------------------------
  const rgbL = LANE_LEFT_COLOR_RGB;
  const rgbR = LANE_RIGHT_COLOR_RGB;
  const rgbA = ACCENT_RGB;

  drawField(waveLeft, rgbL, cxs[0], cys[0], poolR, null, 1);
  drawField(waveRight, rgbR, cxs[2], cys[2], poolR, null, 1);
  // La gota del cerebro combina las tres frecuencias por dominancia local.
  renderBrain();
  drawField({ render: () => brainCanvas }, null, cxs[1], cys[1], poolR, null, 1);

  const pools = [
    { x: cxs[0], y: cys[0], color: LANE_LEFT_COLOR },
    { x: cxs[1], y: cys[1], color: accentColor },
    { x: cxs[2], y: cys[2], color: LANE_RIGHT_COLOR },
  ];

  pools.forEach((pool) => {
    // Sombreado esférico: los bordes se oscurecen para que se lea como
    // una gota esférica de agua con luz.
    const shade = ctx2d.createRadialGradient(
      pool.x - poolR * 0.25,
      pool.y - poolR * 0.25,
      poolR * 0.15,
      pool.x,
      pool.y,
      poolR,
    );
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.7, 'rgba(0,0,0,0.05)');
    shade.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx2d.fillStyle = shade;
    ctx2d.beginPath();
    ctx2d.arc(pool.x, pool.y, poolR, 0, Math.PI * 2);
    ctx2d.fill();

    // Luz entrando en la gota: brillo suave y destello especular arriba a la izquierda.
    const hx = pool.x - poolR * 0.32;
    const hy = pool.y - poolR * 0.38;
    const hg = ctx2d.createRadialGradient(hx, hy, 0, hx, hy, poolR * 0.45);
    hg.addColorStop(0, 'rgba(255,255,255,0.3)');
    hg.addColorStop(0.3, 'rgba(255,255,255,0.07)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx2d.fillStyle = hg;
    ctx2d.beginPath();
    ctx2d.arc(pool.x, pool.y, poolR, 0, Math.PI * 2);
    ctx2d.fill();

    const gl = ctx2d.createRadialGradient(hx, hy, 0, hx, hy, poolR * 0.13);
    gl.addColorStop(0, 'rgba(255,255,255,0.9)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx2d.fillStyle = gl;
    ctx2d.beginPath();
    ctx2d.ellipse(hx, hy, poolR * 0.17, poolR * 0.12, -0.5, 0, Math.PI * 2);
    ctx2d.fill();
  });

  // Núcleo de la gota central: el cerebro, pulsa suave con el latido real.
  const brain = pools[1];
  const coreR = poolR * 0.17 * (0.85 + eased * 0.4);
  const glow = ctx2d.createRadialGradient(brain.x, brain.y, 0, brain.x, brain.y, coreR * 3.2);
  glow.addColorStop(0, hexToRgba(accentColor, 0.5 + eased * 0.3));
  glow.addColorStop(1, hexToRgba(accentColor, 0));
  ctx2d.fillStyle = glow;
  ctx2d.beginPath();
  ctx2d.arc(brain.x, brain.y, coreR * 3.2, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.beginPath();
  ctx2d.arc(brain.x, brain.y, coreR, 0, Math.PI * 2);
  ctx2d.fillStyle = hexToRgba('#ffffff', 0.4 + eased * 0.4);
  ctx2d.fill();

}
drawVisual();

// Restaura la sesión guardada: volumen, ambientes, volúmenes por capa y
// temporizador (el estado lo elige el deep link o el guardado).
function restoreSession(saved) {
  if (!saved) return;
  if (typeof saved.volume === 'number') {
    volumeLevel = saved.volume;
    volume.value = String(saved.volume);
    volumeLabel.textContent = `${Math.round(saved.volume * 100)}%`;
    engine.setVolume(volumeLevel);
  }
  if (Array.isArray(saved.ambient)) {
    ambientTypes = new Set(
      saved.ambient.filter((t) => ['lluvia', 'rio', 'bosque', 'pajaros', 'oceano', 'fuego'].includes(t)),
    );
  }
  if (typeof saved.ambientVolume === 'number') {
    ambientVolumeLevel = saved.ambientVolume;
    ambientVolume.value = String(saved.ambientVolume);
    ambientVolumeLabel.textContent = `${Math.round(saved.ambientVolume * 100)}%`;
    ambient.setVolume(ambientVolumeLevel);
  }
  if (saved.layerVolumes) {
    document.querySelectorAll('#ambient-volumes input').forEach((inp) => {
      const v = saved.layerVolumes[inp.dataset.type];
      if (typeof v === 'number') {
        inp.value = String(v);
        const label = inp.closest('.av').querySelector('b');
        label.textContent = `${Math.round(v * 100)}%`;
        ambient.setLayerVolume(inp.dataset.type, v);
      }
    });
  }
  if (typeof saved.timer === 'number') {
    timerMinutes = saved.timer;
    timerOptions.querySelectorAll('.timer-btn').forEach((b) =>
      b.classList.toggle('active', parseInt(b.dataset.minutes, 10) === saved.timer),
    );
  }
}

// ---------------------------------------------------------------- Arranque
// Deep link: ?state=meditacion abre directamente ese estado (tiene prioridad
// sobre la sesión guardada para que compartir funcione).
const deepParams = new URLSearchParams(location.search);
const deepState = deepParams.get('state');
// Deep link de portadora: ?carrier=solfeggio/ancestral/schumann/personalizado
// marca la familia directamente. Por compatibilidad con enlaces antiguos,
// ?f1=528 / ?f1=136.1 / ?f1=194.7 se interpretan como esas familias, y
// cualquier otro f1 como portadora personalizada.
const deepCarrier = deepParams.get('carrier');
const deepF1 = parseFloat(deepParams.get('f1'));
if (deepCarrier && deepCarrier in CARRIER_BASE && deepCarrier !== 'estandar') {
  carrier = deepCarrier;
  // En la portadora personalizada el f1 viaja en la URL; las familias
  // fijas (Solfeggio/Ancestral) derivan la base del estado al cargar.
  if (deepCarrier === 'personalizado' && isFinite(deepF1) && deepF1 > 0) {
    customBase.value = String(Math.round(deepF1));
    customBaseLabel.textContent = `Portadora: ${Math.round(deepF1)} Hz`;
  }
} else if (deepF1 === 528) carrier = 'solfeggio';
else if (deepF1 === 136.1) carrier = 'ancestral';
else if (deepF1 === 194.7) carrier = 'schumann';
else if (isFinite(deepF1) && deepF1 > 0) {
  carrier = 'personalizado';
  customBase.value = String(Math.round(deepF1));
  customBaseLabel.textContent = `Portadora: ${Math.round(deepF1)} Hz`;
}
const savedSession = lsGet(LS_SESSION, null);
const wantId = deepState || (savedSession && savedSession.state);
const initial = STATES.find((s) => s.id === wantId) || STATES[0];
restoreSession(savedSession);
selectState(initial);
updateCustomLabels();
// Marca la portadora activa (fila principal y modo girado) y muestra el panel.
syncCarrierChips();
updateCustomPanel();
updateCarrierWarning();
updateAmbientButtons();
updateHistory();

// Loader animado: se desvanece cuando la página terminó de cargar, con un
// mínimo de 2.2 s para que se disfruten las animaciones.
const loader = document.getElementById('loader');
const loadStart = performance.now();
const LOADER_MIN_MS = 2200;

// Partículas flotantes del fondo del loader.
if (loader) {
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('span');
    p.className = 'fp';
    const s = 2 + Math.random() * 4;
    p.style.width = p.style.height = `${s}px`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDuration = `${4 + Math.random() * 7}s`;
    p.style.animationDelay = `${Math.random() * 6}s`;
    loader.appendChild(p);
  }
}

// Fondo animado del loader: estrellas que viajan hacia el espectador con
// parpadeo — movimiento garantizado mientras carga.
const loaderStars = document.getElementById('loader-stars');
if (loaderStars) {
  const lctx = loaderStars.getContext('2d');
  let lsw = 0;
  let lsh = 0;
  const lstars = [];
  function lsResize() {
    lsw = loaderStars.width = window.innerWidth;
    lsh = loaderStars.height = window.innerHeight;
    lstars.length = 0;
    for (let i = 0; i < 110; i++) {
      lstars.push({
        x: Math.random() * lsw,
        y: Math.random() * lsh,
        z: Math.random(),
        s: Math.random() * 2.2 + 0.5,
        a: Math.random() * 0.5 + 0.3,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }
  lsResize();
  window.addEventListener('resize', lsResize);
  function lsFrame() {
    if (!document.getElementById('loader')) return;
    lctx.clearRect(0, 0, lsw, lsh);
    for (const st of lstars) {
      st.z += 0.006;
      if (st.z > 1) st.z = 0;
      st.tw += 0.06;
      const scale = 1 + st.z * 2.2;
      const x = st.x + (st.x - lsw / 2) * (scale - 1) * 0.05;
      const y = st.y + (st.y - lsh / 2) * (scale - 1) * 0.05;
      const alpha = st.a * (1 - st.z * 0.55) * (0.6 + 0.4 * Math.sin(st.tw));
      lctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      lctx.beginPath();
      lctx.arc(x, y, st.s * (0.5 + st.z), 0, Math.PI * 2);
      lctx.fill();
    }
    requestAnimationFrame(lsFrame);
  }
  requestAnimationFrame(lsFrame);
}

// Barra de progreso sincronizada con la duración mínima del loader.
const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');
if (loaderFill) {
  const progTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - loadStart) / LOADER_MIN_MS);
    const pct = Math.round(k * 100);
    loaderFill.style.width = `${pct}%`;
    if (loaderPct) loaderPct.textContent = `${pct}%`;
    if (k >= 1) clearInterval(progTimer);
  }, 33);
}

function hideLoader() {
  if (!loader || loader.classList.contains('done')) return;
  const remain = Math.max(0, LOADER_MIN_MS - (performance.now() - loadStart));
  setTimeout(() => {
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 900);
  }, remain);
}
if (document.readyState === 'complete') hideLoader();
else window.addEventListener('load', hideLoader);
setTimeout(hideLoader, LOADER_MIN_MS + 2500); // seguridad: nunca quedarse colgado

// Animación de aparición al deslizar: cada componente aparece con una
// cascada suave al entrar en pantalla (secciones, tarjetas, botones…).
// Detección por scroll con fallback, funciona en cualquier navegador.
const revealables = [
  ...document.querySelectorAll(
    '.hero, .panel, .controls, .info, .card, .legend-item, .status, .timer-btn, .ambient-btn, .mixer-btn, .volume-row',
  ),
];
revealables.forEach((el, i) => {
  el.classList.add('reveal');
  el.dataset.rev = String(i % 6); // posición en la cascada
});
function checkReveal() {
  const vh = window.innerHeight;
  revealables.forEach((el) => {
    if (!el.classList.contains('revealed') && el.getBoundingClientRect().top < vh * 0.94) {
      // Cascada: los componentes del mismo grupo entran con un pequeño retardo.
      el.style.transitionDelay = `${Number(el.dataset.rev) * 70}ms`;
      el.classList.add('revealed');
    }
  });
}
window.addEventListener('scroll', checkReveal, { passive: true });
window.addEventListener('resize', checkReveal);
checkReveal();
// Fallback: si algo falla, nunca dejar el contenido oculto.
setTimeout(() => {
  revealables.forEach((el) => el.classList.add('revealed'));
}, 6000);

// Filtro por banda de frecuencia (delta, theta, alfa, beta, gamma…).
function bandKeyOf(state) {
  return state.custom ? 'personalizado' : state.band.toLowerCase().split(' ')[0];
}
function applyBandFilter(band) {
  cards.forEach((card) => {
    const s = STATES.find((st) => st.id === card.dataset.id);
    let show;
    if (band === 'favs') show = favorites.has(s.id);
    else show = !band || bandKeyOf(s) === band;
    card.classList.toggle('filtered-out', !show);
  });
  // Si el estado elegido quedó oculto, elegir el primero visible.
  const hidden =
    band === 'favs' ? !favorites.has(selected.id) : band && bandKeyOf(selected) !== band;
  if (hidden) {
    const firstVisible = cards.find((c) => !c.classList.contains('filtered-out'));
    if (firstVisible) {
      selectState(STATES.find((st) => st.id === firstVisible.dataset.id));
    }
  }
}
const bandFilter = document.getElementById('band-filter');
bandFilter.addEventListener('click', (e) => {
  const chip = e.target.closest('.band-chip');
  if (!chip) return;
  bandFilter.querySelectorAll('.band-chip').forEach((c) => c.classList.toggle('active', c === chip));
  applyBandFilter(chip.dataset.band);
});
