// src/api/auth.js
// Autenticación contra el backend Vyneural. Aditivo: sin backend la app
// funciona igual (todo local).

import { post, get, clearSession, storeSession } from './client.js';

export async function register({ email, password, username, display_name }) {
  const session = await post('/api/v1/auth/register', {
    email,
    password,
    username,
    display_name,
  });
  storeSession(session);
  return session;
}

export async function login({ email, password }) {
  const session = await post('/api/v1/auth/login', { email, password });
  storeSession(session);
  return session;
}

export async function logout() {
  try {
    const refreshToken = localStorage.getItem('vyneural_refresh_token');
    if (refreshToken) await post('/api/v1/auth/logout', { refresh_token: refreshToken });
  } catch (_) {
    /* sin conexión: la sesión local se limpia igualmente */
  } finally {
    clearSession();
  }
}

export async function me() {
  return get('/api/v1/auth/me');
}
