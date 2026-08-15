// ── Página "Tu rutina" ───────────────────────────────────────────────────────
// Muestra los recordatorios/rituales guardados (los mismos que el generador
// persiste en localStorage bajo vyneural_alarms) con su repetición semanal,
// frecuencia y próxima ocurrencia. Permite eliminar; dentro de la APK también
// cancela la alarma nativa del AlarmManager (CANCEL_ALARM vía bridge).

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
const IN_APK =
  typeof window !== 'undefined' &&
  (typeof window.AndroidBridgeNative !== 'undefined' || location.protocol === 'file:');

const listEl = document.getElementById('rutina-list');
const emptyEl = document.getElementById('rutina-empty');
const countEl = document.getElementById('rutina-count');

function render() {
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

// La rutina vive en este dispositivo (localStorage). La alarma de la APK la
// programa el reloj del sistema; esta vista es el espejo de la UI.
function refreshState() {
  // Web/PWA: la rutina es exclusiva de la APK → aviso honesto, sin lista.
  const content = document.getElementById('rutina-content');
  const gate = document.getElementById('rutina-apk-gate');
  if (!IN_APK) {
    if (content) content.classList.add('hidden');
    if (gate) gate.classList.remove('hidden');
    return;
  }
  render();
  const note = document.getElementById('rutina-platform-note');
  if (note) {
    note.textContent =
      'En la APK estas alarmas las programa el reloj del sistema de Android: siguen sonando con la app cerrada y con pantalla bloqueada (con vibración).';
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
  const go = document.getElementById('rutina-go');
  if (go) go.addEventListener('click', () => (location.href = '/#alarms-view'));
});
