// src/core/session-store.js
// P3 — sanitización de datos persistidos (crash recovery / tolerancia a
// corrupción). Todo lo que se lee de localStorage/IndexedDB y se restaura en
// la UI pasa por aquí ANTES de tocar el estado vivo. Un valor corrupto
// (NaN, fuera de rango, tipo raro) se descarta, nunca rompe la restauración
// y nunca deja la UI en un estado imposible.
//
// Regla de diseño: los STRINGS se validan donde ya se validan en main.js
// (STATES.find, WAVES.some, validGoals) para no duplicar whitelists frágiles;
// aquí se protege lo que PUEDE romper la ejecución: números y arrays.

const AMBIENT_TYPES = ['lluvia', 'rio', 'bosque', 'pajaros', 'oceano', 'fuego'];

function finite01(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}
function finitePositive(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}
function finiteNonNeg(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Normaliza la sesión guardada (ob-session-v1). Devuelve null si no hay nada
 * útil; descarta silenciosamente los campos corruptos.
 */
export function sanitizeSession(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (typeof raw.state === 'string') out.state = raw.state;
  if (finite01(raw.volume)) out.volume = raw.volume;
  if (Array.isArray(raw.ambient)) {
    out.ambient = raw.ambient.filter((t) => AMBIENT_TYPES.includes(t));
  }
  if (finite01(raw.ambientVolume)) out.ambientVolume = raw.ambientVolume;
  if (raw.layerVolumes && typeof raw.layerVolumes === 'object' && !Array.isArray(raw.layerVolumes)) {
    const layers = {};
    for (const [k, v] of Object.entries(raw.layerVolumes)) {
      if (finite01(v)) layers[k] = v;
    }
    if (Object.keys(layers).length) out.layerVolumes = layers;
  }
  if (finiteNonNeg(raw.timer)) out.timer = raw.timer;
  if (typeof raw.wave === 'string') out.wave = raw.wave;
  if (raw.custom && typeof raw.custom === 'object' && !Array.isArray(raw.custom)) {
    const c = {};
    if (finitePositive(raw.custom.base)) c.base = raw.custom.base;
    if (finitePositive(raw.custom.beat)) c.beat = raw.custom.beat;
    if (Object.keys(c).length) out.custom = c;
  }
  if (typeof raw.goal === 'string') out.goal = raw.goal;
  return Object.keys(out).length ? out : null;
}

/** Favoritos (ob-favs-v1): solo ids de estado como strings, acotados. */
export function sanitizeFavorites(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => typeof s === 'string' && s.length > 0).slice(0, 200);
}

/** Historial (ob-history-v1): registros con forma válida, últimos 50. */
export function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r) =>
        r &&
        typeof r === 'object' &&
        typeof r.id === 'string' &&
        finiteNonNeg(r.min) &&
        typeof r.ts === 'number' &&
        Number.isFinite(r.ts),
    )
    .slice(-50)
    .map((r) => ({
      id: r.id,
      name: typeof r.name === 'string' ? r.name : r.id,
      band: typeof r.band === 'string' ? r.band : '',
      min: Math.max(1, Math.round(r.min)),
      ts: r.ts,
    }));
}
