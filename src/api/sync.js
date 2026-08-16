// src/api/sync.js
// Sincronización incremental (FASE 12). Aditiva: IndexedDB/localStorage
// siguen siendo el store local; este módulo sube/baja cambios cuando hay
// sesión y conexión. Estrategia: SERVER_WINS por updated_at.

import { get, post } from './client.js';

const LS_LAST_SYNC = 'vyneural_last_sync_at';
const LS_QUEUE = 'vyneural_sync_queue';

// ── Cola local de entidades pendientes de subir (localStorage) ──────────────

export function enqueueLocal(entityType, entityId, payload, updatedAt, deleted = false) {
  try {
    const queue = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
    const existing = queue.find((e) => e.entity_type === entityType && e.entity_id === entityId);
    const entry = { entity_type: entityType, entity_id: entityId, updated_at: updatedAt, deleted, payload };
    if (existing) Object.assign(existing, entry);
    else queue.push(entry);
    // Acotado: nunca crecer sin límite.
    localStorage.setItem(LS_QUEUE, JSON.stringify(queue.slice(-200)));
  } catch (_) {
    /* sin storage: el cambio queda solo local */
  }
}

export function drainQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
    localStorage.removeItem(LS_QUEUE);
    return queue;
  } catch (_) {
    return [];
  }
}

// ── Pull / Push ─────────────────────────────────────────────────────────────

export async function pullChanges(since) {
  const q = since ? `?since=${encodeURIComponent(since)}` : '';
  return get(`/api/v1/sync${q}`);
}

export async function pushLocal(entities) {
  const res = await post('/api/v1/sync', { entities });
  // Conflictos server-wins: el cliente debe reemplazar su copia local.
  return res;
}

export async function syncNow(updatedAt) {
  const since = localStorage.getItem(LS_LAST_SYNC) || undefined;
  const result = await pushLocal(drainQueue());
  const changes = await pullChanges(since);
  localStorage.setItem(LS_LAST_SYNC, updatedAt || new Date().toISOString());
  return { result, changes };
}
