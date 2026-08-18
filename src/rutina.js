// ── Página "Tu rutina" ───────────────────────────────────────────────────────
// Muestra los recordatorios/rituales guardados (los mismos que el generador
// persiste en localStorage bajo vyneural_alarms) con su repetición semanal,
// frecuencia y próxima ocurrencia. Permite eliminar; dentro de la APK también
// cancela la alarma nativa del AlarmManager (CANCEL_ALARM vía bridge).
//
// Desde 1.2, la rutina UNIFICA recordatorios + itinerarios: un itinerario ES
// una rutina de pasos (frecuencias en secuencia con su duración). Los
// itinerarios viven en la nube (cuenta opcional); sin cuenta o sin backend,
// la página sigue funcionando con los recordatorios locales y un aviso.
//
// REGLA DE ORO (APK): "Iniciar" un itinerario NUNCA autoplaya. El enlace
// lleva al generador configurado (freq/beat/wave) SIN autostart: el audio
// nace solo con un gesto explícito del usuario (P5.1/P5.6).

import { getAccessToken } from './api/client.js';
import { listItineraries, reorderItineraryItems } from './api/itineraries.js';
import { listFrequencies } from './api/frequencies.js';
import { freqCoverSVG } from './ui/freq-cover.js';

// Sanitización: los nombres de frecuencias/itinerarios vienen del usuario
// (backend), nunca se inyectan sin escapar.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LS_ALARMS = 'vyneural_alarms';
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_NAMES = [
  'domingo', 'lunes', 'martes', 'miércoles',
  'jueves', 'viernes', 'sábado',
];

function getAlarms() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ALARMS) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveAlarms(alarms) {
  try {
    localStorage.setItem(LS_ALARMS, JSON.stringify(alarms));
  } catch {
    /* sin almacenamiento */
  }
}

function cancelNativeAlarm(alarmId) {
  try {
    const b = window.AndroidBridgeNative;
    if (b && typeof b.postMessage === 'function') {
      b.postMessage(JSON.stringify({ command: 'CANCEL_ALARM', payload: { alarmId } }));
    }
  } catch {
    /* sin bridge: solo se quita de la lista */
  }
}

function daysLabel(days) {
  if (!days || days.length === 0) return 'Solo una vez';
  if (days.length === 7) return 'Todos los días';
  const ordered = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  return ordered.map((d) => DAY_LETTERS[d]).join(' · ');
}

function daysNames(days) {
  if (!days || days.length === 0) return 'Solo una vez';
  if (days.length === 7) return 'todos los días';
  const ordered = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  return ordered.map((d) => DAY_NAMES[d]).join(', ');
}

function fmtWhen(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const today = new Date().toDateString();
  if (d.toDateString() === today) return 'hoy';
  const tomorrow = new Date(Date.now() + 86400000).toDateString();
  if (d.toDateString() === tomorrow) return 'mañana';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
}

// La rutina (repetición por días, página incluida) es EXCLUSIVA de la APK de
// Android: solo el reloj del sistema puede reprogramar alarmas con la app
// cerrada. En web/PWA la página muestra un aviso honesto en lugar de la lista.
// `?apk=1` fuerza la vista APK en el navegador SOLO para desarrollo/pruebas
// (simula el bridge): en producción el check real es AndroidBridgeNative.
const IN_APK =
  typeof window !== 'undefined' &&
  (typeof window.AndroidBridgeNative !== 'undefined' ||
    location.protocol === 'file:' ||
    new URLSearchParams(location.search).has('apk'));

const listEl = document.getElementById('rutina-list');
const emptyEl = document.getElementById('rutina-empty');
const countEl = document.getElementById('rutina-count');
const itListEl = document.getElementById('rutina-it-list');
const itEmptyEl = document.getElementById('rutina-it-empty');
const itCountEl = document.getElementById('rutina-it-count');
const itSyncEl = document.getElementById('rutina-it-sync');

// ── Itinerarios (la rutina de pasos, unificada) ─────────────────────────────

function freqUrlParams(freq) {
  const base = freq ? (freq.left_frequency != null ? freq.left_frequency : freq.carrier_frequency) : 220;
  const beat = freq ? freq.beat_frequency : 10;
  const wave = freq ? freq.waveform : 'sine';
  const q = new URLSearchParams();
  if (base != null) q.set('freq', String(base));
  if (beat != null) q.set('beat', String(beat));
  q.set('wave', wave || 'sine');
  // Sin autostart: el usuario toca play (nunca audio espontáneo).
  return q.toString();
}

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  if (s === 0) return 'sin duración';
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}

function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function stepLabel(item) {
  const f = savedFreqsMap.get(item.frequency_id);
  const base = f ? (f.left_frequency != null ? f.left_frequency : f.carrier_frequency) : null;
  return {
    name: f ? f.name : 'Frecuencia',
    base,
    beat: f ? (f.beat_frequency != null ? f.beat_frequency : 10) : 10,
    wave: f && f.waveform ? f.waveform : 'sine',
    dur: item.duration || 0,
    freq: f || null,
  };
}

// Mismo mapeo que ICS_DAY en notifications.js (JS Date.getDay(): 0=domingo).
const RRULE_DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function daysFromRepeatRule(rule) {
  const m = rule && /BYDAY=([A-Z,]+)/.exec(rule);
  if (!m) return [];
  return m[1].split(',').map((c) => RRULE_DAY_CODES.indexOf(c)).filter((d) => d >= 0);
}

// Horario real del paso (hora de reloj + días), a diferencia del offset
// acumulado que ya calcula la línea de tiempo. Si tiene horario, el paso
// tiene una alarma de recordatorio (Web Push) sincronizada en el backend.
function scheduleLabel(item) {
  if (!item.time_of_day) return '';
  const days = daysFromRepeatRule(item.repeat_rule);
  const when = days.length ? `${item.time_of_day} · ${daysLabel(days)}` : `${item.time_of_day} · una vez`;
  return ` · 🔔 ${when}`;
}

// Enlace de reproducción secuencial: el generador recibe la secuencia completa
// (?seq=…) además de la primera frecuencia. NUNCA autoplay: la barra llega en
// pausa y el countdown corre solo con el play del usuario.
function seqUrlParams(items, name) {
  const steps = items
    .map((item) => {
      const s = stepLabel(item);
      return {
        n: s.name,
        base: s.base != null ? Math.round(s.base * 10) / 10 : 220,
        beat: s.beat != null ? Math.round(s.beat * 10) / 10 : 10,
        wave: s.wave || 'sine',
        dur: Math.max(0, Math.round(s.dur || 0)),
      };
    })
    .filter((s) => s.dur > 0);
  if (!steps.length) return '';
  return `&seq=${encodeURIComponent(JSON.stringify({ name, steps }))}`;
}

// La línea de tiempo del itinerario: sus pasos en orden con duración y horario
// acumulado (00:00 → 10:00 → 20:00…), como el horario de /cuenta. El itinerario
// ES la rutina: se ve completo adentro de esta vista, no solo como enlace.
function itineraryTimelineHTML(items, itId) {
  let cursor = 0;
  const rows = items.map((item, i) => {
    const s = stepLabel(item);
    const start = cursor;
    cursor += s.dur;
    const durLabel = s.dur > 0 ? fmtDuration(s.dur) : 'sin duración';
    const clock = s.dur > 0 ? ` · ${fmtClock(start)} → ${fmtClock(cursor)}` : '';
    const hz = s.base != null ? ` · ${Math.round(s.base)} Hz` : '';
    const schedule = scheduleLabel(item);
    const canUp = i > 0;
    const canDown = i < items.length - 1;
    return `<div class="rutina-step">
        <span class="rutina-step-n">${i + 1}</span>
        ${freqCoverSVG(s.freq || { waveform: s.wave }, 28)}
        <span class="rutina-step-body">
          <b>${escapeHtml(s.name)}</b>
          <small>${durLabel}${clock}${hz}${schedule}</small>
        </span>
        <span class="rutina-step-reorder">
          <button type="button" class="reorder-btn" data-reorder="up" data-it="${escapeHtml(itId)}" data-step="${escapeHtml(item.id)}"${canUp ? '' : ' disabled'} aria-label="Subir el paso ${i + 1}">↑</button>
          <button type="button" class="reorder-btn" data-reorder="down" data-it="${escapeHtml(itId)}" data-step="${escapeHtml(item.id)}"${canDown ? '' : ' disabled'} aria-label="Bajar el paso ${i + 1}">↓</button>
        </span>
      </div>`;
  }).join('');
  const total = items.reduce((acc, it) => acc + (it.duration || 0), 0);
  const totalLabel = total > 0 ? ` · total ${fmtDuration(total)}` : '';
  return `<div class="rutina-timeline" data-it="${escapeHtml(itId)}">
      ${rows || '<p class="rutina-empty-inline">Sin pasos: funciona como aviso de horario.</p>'}
      <p class="rutina-timeline-total">🧭 ${items.length} paso${items.length === 1 ? '' : 's'}${totalLabel}</p>
    </div>`;
}

function renderItineraries(list) {
  if (!itListEl || !itEmptyEl) return;
  itListEl.innerHTML = '';
  const has = list.length > 0;
  itListEl.classList.toggle('hidden', !has);
  itEmptyEl.classList.toggle('hidden', has);
  if (itCountEl) itCountEl.textContent = String(list.length);

  list.forEach((it) => {
    const items = (it.items || []).slice().sort((a, b) => a.position - b.position);
    const li = document.createElement('li');
    li.className = 'rutina-item rutina-item-it';

    const badge = document.createElement('span');
    badge.className = 'rutina-day-badge';
    badge.textContent = String(items.length);

    const body = document.createElement('div');
    body.className = 'rutina-body';

    const name = document.createElement('div');
    name.className = 'rutina-name';
    name.textContent = it.name || 'Itinerario';

    const meta = document.createElement('div');
    meta.className = 'rutina-meta';
    const totalSec = items.reduce((acc, item) => acc + (item.duration || 0), 0);
    meta.textContent = [
      it.is_active === false ? 'en pausa' : 'activo',
      totalSec > 0 ? fmtDuration(totalSec) : 'sin duración fija',
      it.timezone || 'UTC',
    ].join(' · ');

    body.append(name, meta);

    const start = document.createElement('a');
    start.className = 'rutina-start';
    // Iniciar lleva al generador con la PRIMERA frecuencia + la secuencia
    // completa (?seq=…): reproduce los pasos en orden. Play siempre manual.
    start.href = items.length
      ? `/?${freqUrlParams(firstFrequency(items))}${seqUrlParams(items, it.name || 'Rutina')}`
      : '/#states-grid';
    start.textContent = 'Iniciar'; // lleva al generador configurado; play manual

    // El itinerario completo, adentro de la rutina: cabecera + línea de tiempo.
    const head = document.createElement('div');
    head.className = 'rutina-head-row';
    head.append(badge, body, start);

    li.append(head);
    const timeline = document.createElement('div');
    timeline.innerHTML = itineraryTimelineHTML(items, it.id);
    li.appendChild(timeline.firstElementChild);
    itListEl.appendChild(li);
  });
}

function firstFrequency(items) {
  const first = items[0];
  if (!first) return null;
  return savedFreqsMap.get(first.frequency_id) || null;
}

let savedFreqsMap = new Map();
let itinerariesLoaded = false;
let currentIts = [];

// Reordenar pasos desde la rutina (↑/↓): optimista — re-render al momento y
// se persiste al backend; si falla, se recarga el estado real de la nube.
itListEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-reorder]');
  if (!btn || btn.disabled) return;
  const itId = btn.dataset.it;
  const stepId = btn.dataset.step;
  const dir = btn.dataset.reorder;
  const it = currentIts.find((x) => x.id === itId);
  if (!it) return;
  const items = (it.items || []).slice().sort((a, b) => a.position - b.position);
  const idx = items.findIndex((x) => x.id === stepId);
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= items.length) return;
  [items[idx], items[target]] = [items[target], items[idx]];
  // UI optimista: aplicar el nuevo orden al momento.
  it.items = items.map((x, i) => ({ ...x, position: i }));
  renderItineraries(currentIts);
  try {
    await reorderItineraryItems(itId, items.map((x) => x.id));
  } catch (_) {
    // Honestidad: si la nube no aceptó, volvemos al orden real del backend.
    if (itSyncEl) {
      itSyncEl.textContent = 'No se pudo guardar el nuevo orden — revisá tu conexión. Se restauró el orden de la nube.';
      itSyncEl.classList.remove('hidden');
    }
    loadItineraries();
  }
});

// ── Resumen diario (práctica de hoy + próximo recordatorio) ────────────────
// Los minutos reales viven en ob-history-v1 (el mismo historial del generador):
// cada sesión terminada queda registrada con su duración. El resumen es un
// espejo honesto de ese dato local, no una estimación.
const LS_HISTORY = 'ob-history-v1';

function todayPractice() {
  try {
    const h = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
    if (!Array.isArray(h)) return { mins: 0, sessions: 0 };
    const today = h.filter((r) => new Date(r.ts).toDateString() === new Date().toDateString());
    return {
      mins: today.reduce((acc, r) => acc + (Number(r.min) || 0), 0),
      sessions: today.length,
    };
  } catch {
    return { mins: 0, sessions: 0 };
  }
}

function renderDaily() {
  const el = document.getElementById('rutina-daily');
  if (!el) return;
  const { mins, sessions } = todayPractice();
  const alarms = getAlarms().slice().sort((a, b) => (a.nextAt || 0) - (b.nextAt || 0));
  const next = alarms[0];
  const stat = (b, label) => `<div class="daily-stat"><b>${b}</b><span>${label}</span></div>`;
  const parts = [stat(String(mins), 'min de práctica hoy'), stat(String(sessions), `${sessions === 1 ? 'sesión' : 'sesiones'} hoy`)];
  if (next) {
    const when = next.nextAt ? `${next.time || ''} · ${fmtWhen(next.nextAt)}` : next.time || '';
    parts.push(stat(escapeHtml(when), `próximo recordatorio · ${escapeHtml(next.name || 'Sesión')}`));
  } else {
    parts.push(stat('—', 'sin recordatorios próximos'));
  }
  el.innerHTML = `<div class="daily-grid">${parts.join('')}</div>`;
}

async function loadItineraries() {
  const sync = itSyncEl;
  try {
    // Sin sesión: los itinerarios viven en la nube; se avisa y no se rompe nada.
    if (!getAccessToken()) {
      if (sync) {
        sync.textContent = 'Sin sesión: los itinerarios se sincronizan con tu cuenta (opcional). Los recordatorios locales siguen acá.';
        sync.classList.remove('hidden');
      }
      currentIts = [];
      renderItineraries([]);
      itinerariesLoaded = true;
      return;
    }
    if (sync) {
      sync.textContent = 'Sincronizando itinerarios…';
      sync.classList.remove('hidden');
    }
    const [its, freqs] = await Promise.all([
      listItineraries().catch(() => []),
      listFrequencies().catch(() => []),
    ]);
    savedFreqsMap = new Map((freqs || []).map((f) => [f.id, f]));
    currentIts = its || [];
    renderItineraries(currentIts);
    if (sync) {
      sync.textContent = 'Itinerarios sincronizados con tu cuenta ✓';
      sync.classList.remove('hidden');
    }
  } catch (_) {
    if (sync) {
      sync.textContent = 'El backend no está disponible: los itinerarios de la nube no se pudieron cargar. Los recordatorios locales siguen funcionando.';
      sync.classList.remove('hidden');
    }
    renderItineraries([]);
  } finally {
    itinerariesLoaded = true;
  }
}

function render() {
  renderDaily();
  const alarms = getAlarms().slice().sort((a, b) => (a.nextAt || 0) - (b.nextAt || 0));
  if (!listEl || !emptyEl) return;
  listEl.innerHTML = '';
  const has = alarms.length > 0;
  listEl.classList.toggle('hidden', !has);
  emptyEl.classList.toggle('hidden', has);
  if (countEl) {
    countEl.textContent = String(alarms.length);
  }

  alarms.forEach((a) => {
    const li = document.createElement('li');
    li.className = 'rutina-item';

    const badge = document.createElement('span');
    badge.className = 'rutina-day-badge';
    badge.textContent = daysLabel(a.days);

    const body = document.createElement('div');
    body.className = 'rutina-body';

    const time = document.createElement('div');
    time.className = 'rutina-time';
    time.textContent = a.time || '08:00';

    const name = document.createElement('div');
    name.className = 'rutina-name';
    name.textContent = a.name || 'Sesión personalizada';

    const meta = document.createElement('div');
    meta.className = 'rutina-meta';
    const parts = [`${Math.round(a.freq)} Hz · ${Math.round(a.beat)} Hz de ritmo`];
    if (a.minutes > 0) parts.push(`${a.minutes} min`);
    parts.push(`próxima: ${fmtWhen(a.nextAt)}`);
    meta.textContent = parts.join(' · ');

    const rep = document.createElement('div');
    rep.className = 'rutina-repeat';
    rep.textContent = a.days && a.days.length ? `Se repite ${daysNames(a.days)}` : 'Una sola vez';

    body.append(time, name, meta, rep);

    const del = document.createElement('button');
    del.className = 'rutina-del';
    del.setAttribute('aria-label', 'Eliminar de la rutina');
    del.textContent = '✕';
    del.addEventListener('click', () => {
      cancelNativeAlarm(a.id);
      saveAlarms(getAlarms().filter((x) => x.id !== a.id));
      render();
    });

    li.append(badge, body, del);
    listEl.appendChild(li);
  });
}

// Los recordatorios de dispositivo viven en localStorage (una sola vez en
// web/PWA; con repetición y alarma real en la APK vía AlarmManager). Los
// itinerarios, en cambio, siempre se cargan si hay sesión: su recordatorio
// llega por Web Push desde el servidor, sin depender de la plataforma.
function refreshState() {
  const gate = document.getElementById('rutina-apk-gate');
  if (gate) gate.classList.toggle('hidden', IN_APK);
  render();
  loadItineraries();
  const note = document.getElementById('rutina-platform-note');
  if (note) {
    note.textContent = IN_APK
      ? 'En la APK estas alarmas las programa el reloj del sistema de Android: siguen sonando con la app cerrada y con pantalla bloqueada (con vibración).'
      : 'En la web/PWA estos recordatorios suenan mientras la pestaña está abierta. Para repetición semanal con alarma real y vibración, instalá la APK.';
    note.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  refreshState();
  // Refrescar si otra pestaña guarda/borra una alarma mientras vemos la página.
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel('vyneural-alarms');
    ch.onmessage = () => render();
  }
  window.addEventListener('storage', render);
  // Refrescar itinerarios al autenticarse / cambiar de sesión desde la nav.
  document.addEventListener('vyneural:auth', () => loadItineraries());
  const go = document.getElementById('rutina-go');
  if (go) go.addEventListener('click', () => (location.href = '/#alarms-view'));
});
