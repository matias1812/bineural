// src/api/push.js
// Web Push VAPID: suscripción del dispositivo contra el backend.
//
// REGLA DE ORO: una notificación Push NUNCA reproduce audio. El SW solo
// muestra la notificación; el usuario decide con un gesto.

import { get, post, del } from './client.js';

export async function pushStatus() {
  return get('/api/v1/push/status');
}

// Registra el Service Worker y suscribe el dispositivo si el backend está
// configurado. Devuelve { configured, subscribed } — nunca lanza si falta
// HTTPS, permisos o SW (la PWA sigue funcionando igual).
export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { configured: false, subscribed: false, reason: 'unsupported' };
  }
  let status;
  try {
    status = await pushStatus();
  } catch (_) {
    return { configured: false, subscribed: false, reason: 'backend-offline' };
  }
  if (!status.configured || !status.public_key) {
    return { configured: false, subscribed: false, reason: 'backend-not-configured' };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(status.public_key);
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }
    await post('/api/v1/push/subscribe', {
      endpoint: subscription.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
      auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
      user_agent: navigator.userAgent.slice(0, 500),
    });
    return { configured: true, subscribed: true };
  } catch (err) {
    return { configured: true, subscribed: false, reason: String(err && err.message || err) };
  }
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return false;
    await del('/api/v1/push/subscribe', {
      endpoint: subscription.endpoint,
      p256dh: '',
      auth: '',
    }).catch(() => {});
    await subscription.unsubscribe();
    return true;
  } catch (_) {
    return false;
  }
}

// Base64url (VAPID public key) → Uint8Array para PushManager.subscribe.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
