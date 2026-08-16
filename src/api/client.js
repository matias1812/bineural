// src/api/client.js
// Cliente HTTP del backend Vyneural (FastAPI). Aditivo: la app sigue
// funcionando sin backend (offline) — este módulo solo se usa si hay sesión.
//
// - Base URL: `VITE_API_URL` si está definida; si no, mismo origen (proxy de
//   Vite en dev / reverse proxy en prod). NUNCA se guardan secretos aquí.
// - Access token en memoria + localStorage (solo para arranque en frío).
// - Refresh automático UNA vez por 401 (rotación), sin carreras (promesa única).
// - Errores normalizados como ApiError { status, detail, code }.

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';

const LS_TOKEN = 'vyneural_access_token';
let accessToken = null;
try {
  accessToken = localStorage.getItem(LS_TOKEN);
} catch (_) {
  accessToken = null;
}

let refreshPromise = null;

export function setAccessToken(token) {
  accessToken = token || null;
  try {
    if (token) localStorage.setItem(LS_TOKEN, token);
    else localStorage.removeItem(LS_TOKEN);
  } catch (_) {
    /* almacenamiento no disponible */
  }
}

export function clearAccessToken() {
  setAccessToken(null);
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  constructor(status, detail, code) {
    super(detail || `error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code || (status === 0 ? 'NETWORK' : status >= 500 ? 'SERVER' : 'API');
  }
}

// Registra la sesión (access + refresh) tras login/register.
export function storeSession(session) {
  setAccessToken(session.access_token);
  try {
    localStorage.setItem('vyneural_refresh_token', session.refresh_token);
  } catch (_) {
    /* sin storage */
  }
}

export function getRefreshToken() {
  try {
    return localStorage.getItem('vyneural_refresh_token');
  } catch (_) {
    return null;
  }
}

export function clearSession() {
  clearAccessToken();
  try {
    localStorage.removeItem('vyneural_refresh_token');
  } catch (_) {
    /* sin storage */
  }
}

// Refresh único compartido: varias peticiones 401 no lanzan refreshes paralelos.
function tryRefresh() {
  if (refreshPromise) return refreshPromise;
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    refreshPromise = Promise.resolve(false);
  } else {
    refreshPromise = fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then((res) => {
        if (!res.ok) return false;
        return res.json().then((j) => {
          storeSession(j);
          return true;
        });
      })
      .catch(() => false);
  }
  return refreshPromise.finally(() => {
    refreshPromise = null;
  });
}

export async function request(path, { method = 'GET', body, retry = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (_) {
    throw new ApiError(0, 'sin conexión con el servidor', 'NETWORK');
  }

  if (res.status === 401 && retry) {
    const ok = await tryRefresh();
    if (ok) return request(path, { method, body, retry: false });
    clearSession();
    throw new ApiError(401, 'sesión expirada', 'UNAUTHORIZED');
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j && j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch (_) {
      /* sin cuerpo JSON */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const get = (path) => request(path);
export const post = (path, body) => request(path, { method: 'POST', body });
export const put = (path, body) => request(path, { method: 'PUT', body });
export const patch = (path, body) => request(path, { method: 'PATCH', body });
export const del = (path, body) =>
  request(path, { method: 'DELETE', body: body === undefined ? undefined : body });
