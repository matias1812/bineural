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
  { id: 'meditacion', icon: ICONS.meditacion, name: 'Meditación', desc: 'Calma mental profunda y claridad interior', band: 'Theta · 6 Hz', color: '#a78bfa', base: 210, beat: 6, featured: true },
  { id: 'sueno', icon: ICONS.sueno, name: 'Sueño profundo', desc: 'Relajación total para un descanso profundo', band: 'Delta · 2 Hz', color: '#60a5fa', base: 170, beat: 2, featured: true },
  { id: 'relajacion', icon: ICONS.relajacion, name: 'Relajación', desc: 'Reduce el estrés y la ansiedad del día', band: 'Alpha · 10 Hz', color: '#34d399', base: 200, beat: 10, featured: true },
  { id: 'concentracion', icon: ICONS.concentracion, name: 'Concentración', desc: 'Atención sostenida y mayor productividad', band: 'Beta · 16 Hz', color: '#fbbf24', base: 240, beat: 16, featured: true },
  { id: 'energia', icon: ICONS.energia, name: 'Energía', desc: 'Estado de alerta, vitalidad y motivación', band: 'Beta · 25 Hz', color: '#fb7185', base: 260, beat: 25 },
  { id: 'creatividad', icon: ICONS.creatividad, name: 'Creatividad', desc: 'Flujo creativo e inspiración', band: 'Theta · 8 Hz', color: '#f0abfc', base: 220, beat: 8, featured: true },
  { id: 'aprendizaje', icon: ICONS.aprendizaje, name: 'Aprendizaje', desc: 'Memoria y procesamiento profundo', band: 'Gamma · 40 Hz', color: '#f97316', base: 280, beat: 40, featured: true },
  { id: 'schumann', icon: ICONS.schumann, name: 'Resonancia Schumann', desc: 'La frecuencia de la Tierra: calma y conexión', band: 'Schumann · 7.83 Hz', color: '#4ade80', base: 190, beat: 7.83, featured: true },
  { id: 'sueno-ligero', icon: ICONS['sueno-ligero'], name: 'Sueño ligero', desc: 'Transición suave hacia el descanso', band: 'Delta · 3 Hz', color: '#818cf8', base: 180, beat: 3, featured: true },
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
const goalFilter = document.getElementById('goal-filter');
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
// Los estados se organizan por objetivo (Dormir, Meditar, Relajarse…):
// enfoque de usuario en vez de bandas técnicas, con encabezado por grupo.
const GOALS = [
  { id: 'dormir', label: 'Dormir', emoji: '😴', bands: ['delta'], tagline: 'Descanso profundo' },
  { id: 'meditar', label: 'Meditar', emoji: '🧘', bands: ['theta'], tagline: 'Calma y creatividad' },
  { id: 'relajarse', label: 'Relajarse', emoji: '🌿', bands: ['alfa'], tagline: 'Suelta el estrés' },
  { id: 'concentrarse', label: 'Concentrarse', emoji: '🧠', bands: ['beta'], tagline: 'Foco y productividad' },
  { id: 'aprender', label: 'Aprender', emoji: '📚', bands: ['gamma'], tagline: 'Memoria y aprendizaje' },
  { id: 'especiales', label: 'Especiales', emoji: '✨', bands: ['schumann', 'personalizado'], tagline: 'Resonancias únicas y a tu medida' },
];
const goalOf = (s) => GOALS.find((g) => g.bands.includes(bandKeyOf(s)));

// Construye la rejilla en grupos (sección con encabezado + sub-rejilla).
const groups = GOALS.map((goal) => {
  const section = document.createElement('section');
  section.className = 'state-group';
  section.dataset.goal = goal.id;
  section.innerHTML = `<h3 class="state-group-title"><span class="sgt-emoji">${goal.emoji}</span><span class="sgt-name">${goal.label}</span><span class="sgt-tagline">${goal.tagline}</span></h3>`;
  const sub = document.createElement('div');
  sub.className = 'grid';
  section.appendChild(sub);
  grid.appendChild(section);
  return { goal, section, sub };
});

const cards = STATES.map((s) => {
  const card = document.createElement('button');
  card.className = 'card';
  card.dataset.id = s.id;
  const fav = favorites.has(s.id);
  // Las dos frecuencias del estado: una por oído (base y base + latido).
  const f1 = Math.round(s.base * 10) / 10;
  const f2 = Math.round((s.base + s.beat) * 10) / 10;
  card.innerHTML = `
    <span class="card-star${fav ? ' fav' : ''}" role="button" tabindex="0" aria-label="Marcar ${s.name} como favorito" aria-pressed="${fav}">${ICONS.star}</span>
    <span class="card-icon" style="color:${s.color}">${s.icon}</span>
    <span class="card-name">${s.name}</span>
    <span class="card-band">${s.band}</span>
    <span class="card-freqs">${f1} Hz · ${f2} Hz</span>
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
  groups.find((g) => g.goal.id === goalOf(s).id).sub.appendChild(card);
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
  const activeChip = goalFilter.querySelector('.band-chip.active');
  if (activeChip && activeChip.dataset.goal === 'favs') applyGoalFilter('favs');
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
  playBtn.innerHTML = ICONS.pause;
  playBtn.setAttribute('aria-label', 'Pausar sesión');
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
  playBtn.innerHTML = ICONS.play;
  playBtn.setAttribute('aria-label', 'Comenzar sesión');
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
// Estado inicial del play sobre las gotas (solo icono).
playBtn.innerHTML = ICONS.play;
playBtn.setAttribute('aria-label', 'Comenzar sesión');

// ---------------------------------------------------------------- Volumen
// Aplica un nivel de volumen compartido por el slider de las gotas y el del
// modo girado.
function setVolume(v) {
  volumeLevel = parseFloat(v);
  volume.value = String(volumeLevel);
  if (volumeLabel) volumeLabel.textContent = `${Math.round(volumeLevel * 100)}%`;
  engine.setVolume(volumeLevel);
  saveSession();
}
volume.addEventListener('input', () => setVolume(volume.value));

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

// Pantalla completa / modo inmersivo: las gotas llenan la pantalla. En
// escritorio se añaden los controles al lado; en teléfono (iOS o Android)
// solo las gotas a pantalla completa, sin giros ni ajustes, con play,
// compartir y volumen sobre el lienzo. iOS Safari solo tiene soporte
// parcial de la Fullscreen API: si no entra, el modo CSS llena igual el
// viewport.
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Marca la portadora activa en la fila principal.
function syncCarrierChips() {
  carrierOptions.querySelectorAll('.carrier-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.carrier === carrier),
  );
}

fullscreenBtn.innerHTML = ICONS.expand;
function setFullscreenIcon(on) {
  fullscreenBtn.innerHTML = on ? ICONS.compress : ICONS.expand;
  fullscreenBtn.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
}
fullscreenBtn.addEventListener('click', async () => {
  if (!document.fullscreenElement && !document.body.classList.contains('immersive')) {
    const el = document.documentElement;
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (req) {
      try {
        await req();
      } catch (_) {
        /* fullscreen no soportado: el modo CSS llena igual la pantalla */
        document.body.classList.add('immersive');
        setFullscreenIcon(true);
      }
      // Soporte parcial (iOS): si no llegó a entrar de verdad, activa el modo CSS.
      setTimeout(() => {
        if (!document.fullscreenElement) {
          document.body.classList.add('immersive');
          setFullscreenIcon(true);
        }
        resizeCanvas();
      }, 250);
    } else {
      document.body.classList.add('immersive');
      setFullscreenIcon(true);
      resizeCanvas();
    }
  } else {
    document.body.classList.remove('immersive');
    setFullscreenIcon(false);
    const ext = document.exitFullscreen?.bind(document) ?? document.webkitExitFullscreen?.bind(document);
    if (ext) {
      try {
        await ext();
      } catch (_) {
        /* no había fullscreen real activo */
      }
    }
    resizeCanvas();
  }
});
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  document.body.classList.toggle('immersive', on);
  setFullscreenIcon(on);
  // El canvas se re-mide al entrar/salir del modo (el layout cambia).
  resizeCanvas();
});

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
// Momento del último impulso de cada cuenca (índice: 0=L, 1=R, 2=B, 3=P).
let impactTimes = [0, 0, 0, 0];
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

// Crea (o recrea si cambió el tamaño) las cuencas de agua. Si ya existían
// campos con ondas en marcha, redimensiona transfiriendo el estado (u y
// prev) en vez de reiniciar: al cambiar de tamaño (p. ej. al entrar en
// pantalla completa) el agua continúa exactamente donde estaba, solo que
// a otra resolución.
function transferField(oldField, newSize, opts) {
  const nf = new WaveField(newSize, opts);
  nf.setCircle(newSize / 2, newSize / 2, newSize / 2 - 1.5);
  if (oldField) {
    const os = oldField.size;
    const ns = newSize;
    const scale = os / ns;
    for (let y = 0; y < ns; y++) {
      for (let x = 0; x < ns; x++) {
        const ox = Math.round((x - ns / 2) * scale + os / 2);
        const oy = Math.round((y - ns / 2) * scale + os / 2);
        if (ox < 0 || oy < 0 || ox >= os || oy >= os) continue;
        const oi = oy * os + ox;
        const ni = y * ns + x;
        nf.u[ni] = oldField.u[oi];
        nf.prev[ni] = oldField.prev[oi];
      }
    }
  }
  return nf;
}

function ensureFields(poolR) {
  if (wavePoolR && Math.abs(wavePoolR - poolR) < 2) return;
  wavePoolR = poolR;
  const size = Math.max(48, Math.ceil(poolR) + 2);
  // c más lento y más amortiguación: anillos limpios y definidos que se
  // expanden y se apagan, sin acumularse en un revoltijo caótico.
  const opts = { c: 0.45, damp: 0.992 };
  waveLeft = transferField(waveLeft, size, opts);
  waveRight = transferField(waveRight, size, opts);
  waveBrainB = transferField(waveBrainB, size, opts);
  waveBrainP = transferField(waveBrainP, size, opts);
  waveBrainA = transferField(waveBrainA, size, opts);
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
  const soft = waveBrainB.soft;
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
    d[o + 3] = soft ? Math.round(255 * soft[i]) : 255;
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

  // Tres gotas en fila: frecuencia 1 | cerebro | frecuencia 2.
  const poolR = Math.min(h, w / 3) * 0.4;
  const cxs = [w / 6, w / 2, (5 * w) / 6];
  const cys = [h / 2, h / 2, h / 2];
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

  // ----- Física: las fuentes excitan directamente el agua ------------------
  // No hay gotas que caigan: las tres frecuencias inyectan su impulso en la
  // cuenca (ondas que se propagan, rebotan en el borde y chocan entre sí) y
  // el latido añade su pulso exacto en la fase 0 del reloj del AudioContext.
  ensureFields(poolR);
  const size = waveLeft.size;
  const s = size / 2;
  const off = size * 0.1; // separación de las fuentes en la unión

  if (playing) {
    // Las tres frecuencias: una fuente por cuenca (los laterales en el
    // centro, la unión con azul y rosa desfasadas que chocan al cruzarse).
    if (t - impactTimes[0] >= 1.5) {
      waveLeft.pokeDisc(s, s, 1.5);
      impactTimes[0] = t;
    }
    if (t - impactTimes[1] >= 1.8) {
      waveRight.pokeDisc(s, s, 1.5);
      impactTimes[1] = t;
    }
    if (t - impactTimes[2] >= 1.3) {
      waveBrainB.pokeDisc(s - off, s, 1.3);
      impactTimes[2] = t;
    }
    if (t - impactTimes[3] >= 1.6) {
      waveBrainP.pokeDisc(s + off, s, 1.3);
      impactTimes[3] = t;
    }
  } else {
    // En pausa: impulsos espaciados y suaves, el agua sigue viva pero
    // tranquila.
    if (t - impactTimes[0] >= 3.4) {
      waveLeft.pokeDisc(s, s, 0.6);
      impactTimes[0] = t;
    }
    if (t - impactTimes[1] >= 3.4) {
      waveRight.pokeDisc(s, s, 0.6);
      impactTimes[1] = t;
    }
    if (t - impactTimes[2] >= 3.4) {
      waveBrainB.pokeDisc(s - off, s, 0.5);
      impactTimes[2] = t;
    }
    if (t - impactTimes[3] >= 3.4) {
      waveBrainP.pokeDisc(s + off, s, 0.5);
      impactTimes[3] = t;
    }
  }
  // Latido: una gota de luz exacta en cada pulso real (fase 0).
  if (playing && phase != null) {
    const wrapped = lastBeatPhase > phase && lastBeatPhase - phase > 0.5;
    if (wrapped) waveBrainA.pokeDisc(s, s, 1.8);
  }
  lastBeatPhase = phase;

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
    if (volumeLabel) volumeLabel.textContent = `${Math.round(saved.volume * 100)}%`;
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
// El filtro arranca en la vista curada 'Destacados' (los más populares);
// si el enlace profundo o la sesión abren otro estado, seguir a su objetivo.
const initialGoal = initial.featured ? 'destacados' : goalOf(initial).id;
const goalChips = [...goalFilter.querySelectorAll('.band-chip')];
goalChips.forEach((c) => c.classList.toggle('active', c.dataset.goal === initialGoal));
applyGoalFilter(initialGoal);
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

// Banda técnica de un estado (delta, theta, alfa, beta, gamma, schumann…).
function bandKeyOf(state) {
  if (state.custom) return 'personalizado';
  const key = state.band.toLowerCase().split(' ')[0];
  // 'Alpha · 10 Hz' se escribe con 'ph' en algunos presets: normalizar.
  return key === 'alpha' ? 'alfa' : key;
}
// Filtro por objetivo (dormir, meditar, concentrarse…) o por favoritos.
function applyGoalFilter(goal) {
  cards.forEach((card) => {
    const s = STATES.find((st) => st.id === card.dataset.id);
    let show;
    if (goal === 'favs') show = favorites.has(s.id);
    else if (goal === 'destacados') show = !!s.featured;
    else show = goalOf(s).id === goal;
    card.classList.toggle('filtered-out', !show);
  });
  // Ocultar los grupos que se quedaron sin estados visibles.
  groups.forEach(({ section, sub }) => {
    const empty = ![...sub.children].some((c) => !c.classList.contains('filtered-out'));
    section.classList.toggle('empty', empty);
  });
  // Si el estado elegido quedó oculto, elegir el primero visible.
  const hidden =
    goal === 'favs'
      ? !favorites.has(selected.id)
      : goal === 'destacados'
        ? !selected.featured
        : goal && goalOf(selected).id !== goal;
  if (hidden) {
    const firstVisible = cards.find((c) => !c.classList.contains('filtered-out'));
    if (firstVisible) {
      selectState(STATES.find((st) => st.id === firstVisible.dataset.id));
    }
  }
}
goalFilter.addEventListener('click', (e) => {
  const chip = e.target.closest('.band-chip');
  if (!chip) return;
  goalFilter.querySelectorAll('.band-chip').forEach((c) => c.classList.toggle('active', c === chip));
  applyGoalFilter(chip.dataset.goal);
});
