// src/api/fav-sync.js
// Puente favoritos locales del generador (ob-favs-v1, ids de estado) ↔
// backend (frequencies + favorites, ids UUID). Aditivo y best-effort:
// sin sesión o sin conexión NO toca nada y nunca lanza.
//
// El estado local se guarda en el `config` de la frecuencia creada
// ({ state_id, band, base, beat }), de modo que al volver a entrar desde
// otro dispositivo se pueden reconciliar con los favoritos locales.

import { getAccessToken } from './client.js';
import { listFrequencies, createFrequency, deleteFrequency } from './frequencies.js';
import { listFavorites, addFavorite, removeFavorite } from './favorites.js';

const LS_FAVS = 'ob-favs-v1';

function getLocalFavs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_FAVS) || '[]');
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function saveLocalFavs(ids) {
  try {
    localStorage.setItem(LS_FAVS, JSON.stringify([...new Set(ids)]));
  } catch (_) {
    /* sin almacenamiento */
  }
}

// Crea (o reutiliza) la frecuencia remota del estado y la marca como
// favorita. Devuelve el id remoto o null.
export async function syncFavoriteToCloud(state) {
  if (!getAccessToken()) return null;
  const { stateId, name, base, beat, band, wave } = state;
  if (!stateId || !name) return null;

  // 1. ¿Ya existe una frecuencia con este state_id?
  let list;
  try {
    list = await listFrequencies();
  } catch (_) {
    return null;
  }
  let freq = list.find((f) => f.config && f.config.state_id === stateId);

  if (!freq) {
    try {
      freq = await createFrequency({
        name: String(name).slice(0, 120),
        carrier_frequency: Number(base) || 220,
        beat_frequency: Number(beat) || 10,
        waveform: wave && ['sine', 'square', 'triangle', 'sawtooth'].includes(wave) ? wave : 'sine',
        condition: 'binaural',
        config: {
          state_id: stateId,
          band: band || '',
          base: Number(base) || 220,
          beat: Number(beat) || 10,
          source: 'generator',
        },
      });
    } catch (_) {
      return null;
    }
  }

  // 2. Marcar favorita (idempotente en el backend).
  try {
    await addFavorite(freq.id);
  } catch (_) {
    return null;
  }
  return freq.id;
}

// Quita un estado de los favoritos remotos (frecuencia + favorito).
export async function syncUnfavoriteFromCloud(stateId) {
  if (!getAccessToken() || !stateId) return;
  try {
    const list = await listFrequencies();
    const freq = list.find((f) => f.config && f.config.state_id === stateId);
    if (!freq) return;
    try {
      await removeFavorite(freq.id);
    } catch (_) {
      /* 404 = ya no estaba */
    }
    try {
      await deleteFrequency(freq.id);
    } catch (_) {
      /* la frecuencia puede estar referenciada por una alarma/itinerario */
    }
  } catch (_) {
    /* sin conexión: se reintenta en la próxima sesión */
  }
}

// Trae los favoritos de la nube y los fusiona en los locales (no borra
// favoritos locales). Devuelve los ids de estado agregados.
export async function pullCloudFavoritesToLocal() {
  if (!getAccessToken()) return [];
  let favs;
  try {
    favs = await listFavorites();
  } catch (_) {
    return [];
  }
  const added = [];
  const local = new Set(getLocalFavs());
  favs.forEach((fav) => {
    const fid = fav && fav.frequency;
    const stateId = fid && fid.config && fid.config.state_id;
    if (stateId && !local.has(stateId)) {
      local.add(stateId);
      added.push(stateId);
    }
  });
  if (added.length) saveLocalFavs([...local]);
  return added;
}
