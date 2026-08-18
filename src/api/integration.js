// src/api/integration.js
// Punto único de integración del backend en la app EXISTENTE.
//
// Progresivo y NO intrusivo:
// - Sin backend configurado (VITE_API_URL vacío y sin flag local) → no hace
//   ninguna llamada de red; la app funciona exactamente como antes (offline).
// - Con backend → registra el SW para push, sincroniza si hay sesión.
// - Todo envuelto en try/catch: un fallo de red NUNCA rompe la app.

import { getAccessToken } from './client.js';
import { subscribeToPush } from './push.js';
import { syncNow } from './sync.js';
import { setStatus, STATUS } from './status.js';

function backendEnabled() {
  const viaEnv = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL;
  if (viaEnv) return true;
  try {
    if (localStorage.getItem('vyneural_backend') === '1') return true;
    // Sesión activa → el backend está en uso (mismo origen /api o VITE_API_URL
    // ya resolvió en el login): la integración (push + sync) debe activarse.
    // Sin esto, en el despliegue con sesión el push nunca arranca y la UI
    // declara "no configurado" aunque el backend tenga VAPID.
    if (getAccessToken()) return true;
    return false;
  } catch (_) {
    return false;
  }
}

// Llama main.js al arranque (no bloquea, no lanza).
export async function initBackendIfConfigured() {
  if (!backendEnabled()) return false;
  setStatus(STATUS.SYNCING);
  try {
    // 1. Web Push: solo si hay sesión (identidad) y el backend lo soporta.
    let pushResult = null;
    if (getAccessToken() && 'serviceWorker' in navigator && 'PushManager' in window) {
      pushResult = await subscribeToPush();
      // Informa al SW si el push está configurado (para su diagnóstico honesto).
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.active && reg.active.postMessage({
          type: 'PUSH_CONFIG',
          configured: !!(pushResult && pushResult.configured),
        });
      } catch (_) {
        /* SW no disponible: el diagnóstico seguirá en false */
      }
    }
    // 2. Sync pull si hay sesión.
    if (getAccessToken()) {
      await syncNow();
      setStatus(STATUS.SYNCED);
    } else {
      setStatus(STATUS.ONLINE);
    }
    return true;
  } catch (_) {
    setStatus(STATUS.ERROR);
    return false;
  }
}
