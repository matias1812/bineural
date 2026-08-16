// src/api/status.js
// Estados ONLINE / OFFLINE / SYNCING / SYNCED / ERROR como emitter mínimo.
// La UI puede suscribirse para mostrar el estado de sincronización sin
// depender del backend (la app sigue 100% funcional offline).

const STATUS = {
  OFFLINE: 'OFFLINE',
  CONNECTING: 'CONNECTING',
  ONLINE: 'ONLINE',
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',
  ERROR: 'ERROR',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
};

const listeners = new Set();
let state = typeof navigator !== 'undefined' && navigator.onLine ? STATUS.ONLINE : STATUS.OFFLINE;

export function getStatus() {
  return state;
}

export function setStatus(next) {
  if (next === state) return;
  state = next;
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (_) {
      /* listener no debe romper el flujo */
    }
  });
}

export function onStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export { STATUS };

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setStatus(STATUS.ONLINE));
  window.addEventListener('offline', () => setStatus(STATUS.OFFLINE));
}
